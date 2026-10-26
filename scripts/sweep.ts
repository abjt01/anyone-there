// Listens to the same set of nothings in many languages and writes down what
// Whisper hears: data/sweep.json. The register page is built from it, and
// anyone with the same model files gets the same results.
//
//   node --experimental-strip-types scripts/sweep.ts

import fs from "node:fs";
import path from "node:path";
import { SpiritBox } from "../lib/engine.ts";
import { noise, type NoiseKind } from "../lib/noise.ts";

export const SWEEP_LANGS = ["en", "hi", "ru", "ja", "zh", "es", "fr", "de", "ko", "pt", "it", "ar", "tr", "nl", "pl", "uk", "vi", "id", "ta", "bn", "ur", "mr", "cy", "nn"];

export const SWEEP_SOUNDS: { kind: NoiseKind; db: number; seed: number }[] = [{ kind: "silence", db: 0, seed: 1 }];
for (const kind of ["white", "pink", "brown"] as const) for (const db of [-70, -55, -40]) for (const seed of [1, 2]) SWEEP_SOUNDS.push({ kind, db, seed });
SWEEP_SOUNDS.push({ kind: "hum", db: -50, seed: 1 }, { kind: "hum", db: -35, seed: 1 });

const box = await SpiritBox.load({ localPath: path.resolve("public/models") + "/", device: "cpu" });
const rows = [];
const t0 = Date.now();
for (const lang of SWEEP_LANGS) {
  for (const s of SWEEP_SOUNDS) {
    const h = await box.listen(noise(s.kind, { seconds: 8, db: s.db, seed: s.seed }), { language: lang });
    rows.push({ lang, ...s, text: h.text, noSpeech: +h.noSpeech.toFixed(3), avgLogprob: +h.avgLogprob.toFixed(3), outcome: h.guard.outcome, heardAs: h.languages[0].code });
  }
  process.stderr.write(`${lang} ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);
}
fs.writeFileSync("data/sweep.json", JSON.stringify({ model: "onnx-community/whisper-base (q8)", seconds: 8, rows }, null, 1) + "\n");
console.log(rows.length, "windows");
