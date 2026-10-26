// Whisper, run with its ghost filters off. Works the same in the browser
// (onnxruntime-web, in a worker) and in Node (tests and the sweep script).

import {
  AutoProcessor,
  AutoTokenizer,
  LogitsProcessor,
  LogitsProcessorList,
  Tensor,
  WhisperForConditionalGeneration,
  env,
  type PreTrainedTokenizer,
  type Processor,
} from "@huggingface/transformers";
import { Medium, pieces, seeded, softmax, topK, type Piece } from "./medium.ts";
import { guardVerdict, type GuardVerdict } from "./guard.ts";

export const MODEL = "whisper-base";
export const SAMPLE_RATE = 16000;

export type LoadOptions = {
  // where the model folder lives: "/models/" in the browser, a directory in Node
  localPath: string;
  device?: "wasm" | "cpu";
  wasmPaths?: string;
  onProgress?: (p: { file: string; loaded: number; total: number }) => void;
};

export type ListenOptions = {
  // a Whisper language code ("ru", "hi"), or null to let the static choose
  language?: string | null;
  temperature?: number;
  seed?: number;
  maxTokens?: number;
};

export type Hearing = {
  text: string;
  pieces: Piece[];
  language: { code: string; p: number };
  // what the static sounded like to the language detector, best first
  languages: { code: string; p: number }[];
  // Whisper's own estimate that nobody is speaking
  noSpeech: number;
  avgLogprob: number;
  guard: GuardVerdict;
  ms: number;
};

class Tap extends LogitsProcessor {
  private readonly medium: Medium;
  constructor(medium: Medium) {
    super();
    this.medium = medium;
  }
  _call(_inputIds: bigint[][], logits: Tensor) {
    // batch of one: logits[0] is this step's scores over the vocabulary
    const row = (logits as unknown as Tensor[])[0];
    this.medium.choose(row.data as Float32Array);
    return logits;
  }
}

type Ids = { sot: number; eot: number; noSpeech: number; langs: Map<number, string> };

export class SpiritBox {
  private readonly processor: Processor;
  private readonly tokenizer: PreTrainedTokenizer;
  private readonly model: WhisperForConditionalGeneration;
  readonly ban: number[];
  private readonly ids: Ids;

  private constructor(processor: Processor, tokenizer: PreTrainedTokenizer, model: WhisperForConditionalGeneration, ban: number[], ids: Ids) {
    this.processor = processor;
    this.tokenizer = tokenizer;
    this.model = model;
    this.ban = ban;
    this.ids = ids;
  }

  static async load(opts: LoadOptions): Promise<SpiritBox> {
    env.allowRemoteModels = false;
    env.allowLocalModels = true;
    env.localModelPath = opts.localPath;
    if (opts.wasmPaths && env.backends.onnx.wasm) env.backends.onnx.wasm.wasmPaths = opts.wasmPaths;
    const progress = opts.onProgress
      ? (p: { status: string; file?: string; loaded?: number; total?: number }) => {
          if (p.status === "progress" && p.file) opts.onProgress!({ file: p.file, loaded: p.loaded ?? 0, total: p.total ?? 0 });
        }
      : undefined;
    const [processor, tokenizer, model] = await Promise.all([
      AutoProcessor.from_pretrained(MODEL, { progress_callback: progress }),
      AutoTokenizer.from_pretrained(MODEL, { progress_callback: progress }),
      WhisperForConditionalGeneration.from_pretrained(MODEL, {
        dtype: { encoder_model: "q8", decoder_model_merged: "q8" },
        device: opts.device ?? "wasm",
        progress_callback: progress,
      }) as Promise<WhisperForConditionalGeneration>,
    ]);
    const vocab = tokenizer.model.tokens_to_ids as Map<string, number>;
    const id = (t: string) => {
      const v = vocab.get(t);
      if (v === undefined) throw new Error(`token ${t} missing`);
      return v;
    };
    const eot = id("<|endoftext|>");
    const gen = model.generation_config as unknown as { suppress_tokens: number[]; lang_to_id: Record<string, number> };
    const langs = new Map(Object.entries(gen.lang_to_id).map(([t, v]) => [v, t.slice(2, -2)]));
    // OpenAI's own decoder bans these symbols (brackets, music notes, quotes);
    // transformers.js doesn't, so without this the spirits only say "[Music]".
    const ban = new Set<number>(gen.suppress_tokens);
    for (let i = 0; i < eot; i++) if (/[()[\]♪♫*]/.test(tokenizer.decode([i]))) ban.add(i);
    // nothing special may be spoken except "I'm done"
    const vocabSize = (model.config as unknown as { vocab_size: number }).vocab_size;
    for (let i = eot + 1; i < vocabSize; i++) ban.add(i);
    const noSpeech = vocab.get("<|nospeech|>") ?? id("<|nocaptions|>");
    return new SpiritBox(processor, tokenizer, model, [...ban], { sot: id("<|startoftranscript|>"), eot, noSpeech, langs });
  }

  get languageCodes(): string[] {
    return [...this.ids.langs.values()];
  }

  async listen(audio: Float32Array, opts: ListenOptions = {}): Promise<Hearing> {
    const t0 = Date.now();
    const { input_features } = (await this.processor(audio)) as { input_features: Tensor };

    // One decoder step after <|startoftranscript|> gives both the language
    // guess and the no-speech probability, the way openai/whisper does it.
    const sot = new Tensor("int64", BigInt64Array.from([BigInt(this.ids.sot)]), [1, 1]);
    const first = (await this.model({ input_features, decoder_input_ids: sot })) as { logits: Tensor };
    const firstLogits = first.logits.data as Float32Array;
    const probs = softmax(firstLogits);
    const noSpeech = probs[this.ids.noSpeech];
    const langLogits = new Float64Array(firstLogits.length).fill(-Infinity);
    for (const id of this.ids.langs.keys()) langLogits[id] = firstLogits[id];
    const langProbs = softmax(langLogits);
    const languages = topK(langProbs, 5).map((a) => ({ code: this.ids.langs.get(a.id)!, p: a.p }));
    const code = opts.language ?? languages[0].code;
    const language = { code, p: langProbs[[...this.ids.langs].find(([, c]) => c === code)![0]] };

    const begin = (this.model.generation_config as unknown as { begin_suppress_tokens?: number[] }).begin_suppress_tokens ?? [];
    const medium = new Medium({ ban: this.ban, banFirst: begin, temperature: opts.temperature ?? 0, random: seeded(opts.seed ?? 1) });
    const list = new LogitsProcessorList();
    list.push(new Tap(medium));
    // the types insist on a full generation_config; the model's own is used when it's left out
    await this.model.generate({
      inputs: input_features,
      language: code,
      task: "transcribe",
      max_new_tokens: opts.maxTokens ?? 40,
      logits_processor: list,
    } as unknown as Parameters<WhisperForConditionalGeneration["generate"]>[0]);

    const isSpecial = (id: number) => id >= this.ids.eot;
    const spoken = medium.steps.filter((s) => !isSpecial(s.id));
    // a chant cut off by the token limit can end halfway through a character
    const text = this.tokenizer.decode(spoken.map((s) => s.id), { skip_special_tokens: true }).replace(/\uFFFD+$/, "").trim();
    // openai/whisper averages log-probabilities over every sampled token, the end token included
    const avgLogprob = medium.steps.length ? medium.steps.reduce((a, s) => a + Math.log(Math.max(s.p, 1e-12)), 0) / medium.steps.length : 0;
    return {
      text,
      pieces: pieces(medium.steps, (ids) => this.tokenizer.decode(ids, { skip_special_tokens: true }), isSpecial),
      language,
      languages,
      noSpeech,
      avgLogprob,
      guard: await guardVerdict({ text, noSpeech, avgLogprob }),
      ms: Date.now() - t0,
    };
  }
}
