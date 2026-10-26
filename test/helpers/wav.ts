import fs from "node:fs";

// 16-bit mono PCM WAV to floats in [-1, 1]
export function readWav(file: string): { rate: number; samples: Float32Array } {
  const b = fs.readFileSync(file);
  let at = 12;
  let rate = 0;
  while (at < b.length) {
    const id = b.toString("ascii", at, at + 4);
    const size = b.readUInt32LE(at + 4);
    if (id === "fmt ") rate = b.readUInt32LE(at + 12);
    if (id === "data") {
      const n = size / 2;
      const samples = new Float32Array(n);
      for (let i = 0; i < n; i++) samples[i] = b.readInt16LE(at + 8 + i * 2) / 32768;
      return { rate, samples };
    }
    at += 8 + size + (size % 2);
  }
  throw new Error(`no data chunk in ${file}`);
}
