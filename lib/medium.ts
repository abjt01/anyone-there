// The medium sits between Whisper's decoder and the token it picks. At every
// step it sees the full spread of the model's scores, keeps a record of the
// voices that almost spoke, and makes the choice itself (greedy, or sampled
// with a seeded random number so a séance can be replayed exactly).

export type Alt = { id: number; p: number };
export type Step = { id: number; p: number; alts: Alt[] };

export type MediumOptions = {
  // token ids that may never be spoken (brackets, music notes: the model's way of saying "no words here")
  ban?: Iterable<number>;
  // token ids that may not open the message (Whisper never starts with a bare space or with the end)
  banFirst?: Iterable<number>;
  // 0 = always the likeliest token
  temperature?: number;
  // returns a number in [0, 1)
  random?: () => number;
  // how many runners-up to remember per step
  keep?: number;
};

export function softmax(logits: ArrayLike<number>, temperature = 1): Float64Array {
  const t = temperature > 0 ? temperature : 1;
  let max = -Infinity;
  for (let i = 0; i < logits.length; i++) if (logits[i] > max) max = logits[i];
  const out = new Float64Array(logits.length);
  if (max === -Infinity) return out;
  let sum = 0;
  for (let i = 0; i < logits.length; i++) {
    const e = logits[i] === -Infinity ? 0 : Math.exp((logits[i] - max) / t);
    out[i] = e;
    sum += e;
  }
  for (let i = 0; i < out.length; i++) out[i] /= sum;
  return out;
}

export function topK(probs: ArrayLike<number>, k: number): Alt[] {
  const top: Alt[] = [];
  for (let id = 0; id < probs.length; id++) {
    const p = probs[id];
    if (p <= 0) continue;
    if (top.length < k) {
      top.push({ id, p });
      top.sort((a, b) => b.p - a.p);
    } else if (p > top[k - 1].p) {
      top[k - 1] = { id, p };
      top.sort((a, b) => b.p - a.p);
    }
  }
  return top;
}

// mulberry32: small, fast and the same on every machine
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Medium {
  readonly steps: Step[] = [];
  private readonly ban: Set<number>;
  private readonly banFirst: Set<number>;
  private readonly temperature: number;
  private readonly random: () => number;
  private readonly keep: number;

  constructor(opts: MediumOptions = {}) {
    this.ban = new Set(opts.ban ?? []);
    this.banFirst = new Set(opts.banFirst ?? []);
    this.temperature = opts.temperature ?? 0;
    this.random = opts.random ?? seeded(1);
    this.keep = opts.keep ?? 4;
  }

  // Picks the next token from one step's logits, records it, and rewrites the
  // logits so that whatever decodes next can only take that token.
  choose(logits: Float32Array | number[]): number {
    for (const id of this.ban) if (id < logits.length) logits[id] = -Infinity;
    if (this.steps.length === 0) for (const id of this.banFirst) if (id < logits.length) logits[id] = -Infinity;
    const probs = softmax(logits);
    const alts = topK(probs, this.keep + 1);
    let id = alts[0]?.id ?? 0;
    if (this.temperature > 0) {
      const tempered = softmax(logits, this.temperature);
      let r = this.random();
      for (let i = 0; i < tempered.length; i++) {
        r -= tempered[i];
        if (r <= 0 && tempered[i] > 0) {
          id = i;
          break;
        }
      }
    }
    this.steps.push({ id, p: probs[id], alts: alts.filter((a) => a.id !== id).slice(0, this.keep) });
    for (let i = 0; i < logits.length; i++) if (i !== id) logits[i] = -Infinity;
    return id;
  }
}

export type Piece = { text: string; p: number; alts: { text: string; p: number }[]; tokens: number };

// Whisper's tokens are bytes, so one Devanagari or Chinese character can take
// two or three of them. Group tokens until they decode to whole characters.
export function pieces(steps: Step[], decode: (ids: number[]) => string, isSpecial: (id: number) => boolean): Piece[] {
  const out: Piece[] = [];
  let buf: Step[] = [];
  let before = "";
  const ids: number[] = [];
  for (const s of steps) {
    if (isSpecial(s.id)) continue;
    ids.push(s.id);
    buf.push(s);
    const now = decode(ids);
    if (now.endsWith("�")) continue;
    const text = now.slice(before.length);
    before = now;
    const first = buf[0];
    out.push({
      text,
      // the chance of the whole piece is the product of its byte tokens
      p: buf.reduce((acc, b) => acc * b.p, 1),
      alts:
        buf.length === 1
          ? first.alts.filter((a) => !isSpecial(a.id)).map((a) => ({ text: decode([a.id]), p: a.p })).filter((a) => !a.text.includes("�"))
          : [],
      tokens: buf.length,
    });
    buf = [];
  }
  return out;
}
