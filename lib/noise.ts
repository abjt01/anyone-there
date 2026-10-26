// Static to listen to when there's no microphone, and for the tests. Seeded,
// so the same seed is the same hiss on every machine.

import { seeded } from "./medium.ts";

export type NoiseKind = "silence" | "white" | "pink" | "brown" | "hum";
export const NOISE_KINDS: NoiseKind[] = ["silence", "white", "pink", "brown", "hum"];

function gauss(r: () => number): number {
  const u = r() || 1e-12;
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

// rms of a buffer in dBFS
export function level(x: Float32Array): number {
  let s = 0;
  for (const v of x) s += v * v;
  return s === 0 ? -Infinity : 10 * Math.log10(s / x.length);
}

export function noise(kind: NoiseKind, opts: { seconds: number; db?: number; seed?: number; rate?: number }): Float32Array<ArrayBuffer> {
  const rate = opts.rate ?? 16000;
  const n = Math.round(opts.seconds * rate);
  const out = new Float32Array(n);
  if (kind === "silence") return out;
  const r = seeded(opts.seed ?? 1);
  if (kind === "white") for (let i = 0; i < n; i++) out[i] = gauss(r);
  else if (kind === "pink") {
    // Paul Kellet's filter
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < n; i++) {
      const w = gauss(r);
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      out[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
      b6 = w * 0.115926;
    }
  } else if (kind === "brown") {
    let last = 0;
    for (let i = 0; i < n; i++) {
      last = (last + 0.02 * gauss(r)) / 1.02;
      out[i] = last;
    }
  } else {
    // mains hum at 50 Hz with its first harmonic, and a little hiss
    for (let i = 0; i < n; i++) out[i] = Math.sin((2 * Math.PI * 50 * i) / rate) + 0.5 * Math.sin((2 * Math.PI * 100 * i) / rate) + 0.15 * gauss(r);
  }
  // scale to the requested loudness
  const target = opts.db ?? -40;
  const gain = Math.pow(10, (target - level(out)) / 20);
  for (let i = 0; i < n; i++) out[i] *= gain;
  return out;
}
