// The browser half: wake Whisper in its worker, listen to the room, or play
// static and listen to that.

import type { Hearing, ListenOptions } from "./engine.ts";
import { noise, type NoiseKind } from "./noise.ts";
import { seeded } from "./medium.ts";

export const RATE = 16000;
export const WINDOW = 8;

type FromWorker =
  | { type: "progress"; file: string; loaded: number; total: number }
  | { type: "awake"; threads: number }
  | { type: "heard"; id: number; hearing: Hearing }
  | { type: "error"; id?: number; message: string };

export class Spirit {
  private worker: Worker;
  private next = 1;
  private waiting = new Map<number, { resolve: (h: Hearing) => void; reject: (e: Error) => void }>();
  threads = 1;

  constructor() {
    this.worker = new Worker(new URL("./spirit.worker.ts", import.meta.url), { type: "module" });
  }

  wake(onProgress: (loaded: number, total: number) => void): Promise<void> {
    const files = new Map<string, { loaded: number; total: number }>();
    return new Promise((resolve, reject) => {
      this.worker.onmessage = (e: MessageEvent<FromWorker>) => {
        const m = e.data;
        if (m.type === "progress") {
          files.set(m.file, { loaded: m.loaded, total: m.total });
          let loaded = 0, total = 0;
          for (const f of files.values()) {
            loaded += f.loaded;
            total += f.total;
          }
          onProgress(loaded, total);
        } else if (m.type === "awake") {
          this.threads = m.threads;
          this.worker.onmessage = (ev: MessageEvent<FromWorker>) => this.reply(ev.data);
          resolve();
        } else if (m.type === "error") reject(new Error(m.message));
      };
      this.worker.postMessage({ type: "wake" });
    });
  }

  private reply(m: FromWorker) {
    if (m.type === "heard") {
      this.waiting.get(m.id)?.resolve(m.hearing);
      this.waiting.delete(m.id);
    } else if (m.type === "error" && m.id !== undefined) {
      this.waiting.get(m.id)?.reject(new Error(m.message));
      this.waiting.delete(m.id);
    }
  }

  listen(audio: Float32Array, opts: ListenOptions): Promise<Hearing> {
    const id = this.next++;
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve, reject });
      // keep our copy: it's replayed later
      this.worker.postMessage({ type: "listen", id, audio: audio.slice(), opts });
    });
  }

  close() {
    this.worker.terminate();
  }
}

export type Source = {
  context: AudioContext;
  // resolves with the next WINDOW seconds of sound
  next(): Promise<Float32Array>;
  // 0..1 through the current window
  progress(): number;
  stop(): void;
};

export async function listenToRoom(): Promise<Source> {
  // the browser's noise suppression would scrub out exactly the hiss the spirits live in
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const context = new AudioContext({ sampleRate: RATE });
  await context.audioWorklet.addModule("/capture-worklet.js");
  const source = context.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(context, "capture");
  const mute = context.createGain();
  mute.gain.value = 0;
  source.connect(node).connect(mute).connect(context.destination);

  const size = WINDOW * RATE;
  let buf = new Float32Array(size);
  let filled = 0;
  let waiter: ((x: Float32Array) => void) | null = null;
  const ready: Float32Array[] = [];
  node.port.onmessage = (e: MessageEvent<Float32Array>) => {
    let block = e.data;
    while (block.length) {
      const take = Math.min(block.length, size - filled);
      buf.set(block.subarray(0, take), filled);
      filled += take;
      block = block.subarray(take);
      if (filled === size) {
        if (waiter) {
          waiter(buf);
          waiter = null;
        } else ready.push(buf);
        buf = new Float32Array(size);
        filled = 0;
      }
    }
  };
  return {
    context,
    next: () => (ready.length ? Promise.resolve(ready.shift()!) : new Promise((r) => (waiter = r))),
    progress: () => filled / size,
    stop: () => {
      stream.getTracks().forEach((t) => t.stop());
      node.disconnect();
      context.close().catch(() => {});
    },
  };
}

const STATIC_KINDS: NoiseKind[] = ["white", "pink", "brown", "hum"];

// Plays a fresh stretch of static each window, quietly, and hands over
// exactly what it played. `quick` skips the waiting (tests, and impatience).
export function listenToStatic(seed: number, opts: { quick?: boolean; audible?: boolean } = {}): Source {
  const context = new AudioContext({ sampleRate: RATE });
  const pick = seeded(seed);
  let started = 0;
  let n = 0;
  return {
    context,
    async next() {
      n++;
      const kind = STATIC_KINDS[Math.floor(pick() * STATIC_KINDS.length)];
      const db = -70 + Math.round(pick() * 30);
      const audio = noise(kind, { seconds: WINDOW, db, seed: seed * 1000 + n });
      if (opts.quick) return audio;
      if (opts.audible !== false) {
        const buffer = context.createBuffer(1, audio.length, RATE);
        buffer.copyToChannel(audio, 0);
        const src = context.createBufferSource();
        src.buffer = buffer;
        // loud enough to hear the hiss, whatever level the spirits got
        const gain = context.createGain();
        gain.gain.value = Math.min(40, Math.pow(10, (-38 - db) / 20));
        src.connect(gain).connect(context.destination);
        src.start();
      }
      started = performance.now();
      await new Promise((r) => setTimeout(r, WINDOW * 1000));
      return audio;
    },
    progress: () => (started ? Math.min(1, (performance.now() - started) / (WINDOW * 1000)) : 0),
    stop: () => {
      context.close().catch(() => {});
    },
  };
}

// Plays a window back, raised to a level you can hear, the way EVP hunters do.
export function replay(context: AudioContext, audio: Float32Array): AudioBufferSourceNode {
  let s = 0;
  for (const v of audio) s += v * v;
  const rms = Math.sqrt(s / audio.length) || 1e-9;
  const buffer = context.createBuffer(1, audio.length, RATE);
  buffer.copyToChannel(new Float32Array(audio), 0);
  const src = context.createBufferSource();
  src.buffer = buffer;
  const gain = context.createGain();
  gain.gain.value = Math.min(200, 0.08 / rms);
  src.connect(gain).connect(context.destination);
  src.start();
  return src;
}

// The spirit's voice: the device's own speech engine, slowed and lowered.
export function speak(text: string, lang: string): boolean {
  if (typeof speechSynthesis === "undefined" || !text) return false;
  const voices = speechSynthesis.getVoices();
  const voice = voices.find((v) => v.lang.toLowerCase().startsWith(lang)) ?? null;
  if (!voice) return false;
  const u = new SpeechSynthesisUtterance(text);
  u.voice = voice;
  u.lang = voice.lang;
  u.rate = 0.7;
  u.pitch = 0.3;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
  return true;
}

export function languageName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}
