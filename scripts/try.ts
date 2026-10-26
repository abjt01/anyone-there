import path from "node:path";
import { SpiritBox } from "../lib/engine.ts";
import { noise } from "../lib/noise.ts";

const box = await SpiritBox.load({ localPath: path.resolve("public/models") + "/", device: "cpu" });
for (const [lang, kind, level] of [["ru", "white", -66], ["en", "silence", 0], ["zh", "white", -66], ["ja", "silence", 0], ["hi", "white", -46], [null, "pink", -40]] as const) {
  const h = await box.listen(noise(kind, { seconds: 8, db: level, seed: 1 }), { language: lang });
  console.log(lang, kind, JSON.stringify(h.text), `nospeech=${h.noSpeech.toFixed(2)} logprob=${h.avgLogprob.toFixed(2)} lang=${h.languages.slice(0, 3).map((l) => `${l.code}:${l.p.toFixed(2)}`).join(",")} ${h.guard.outcome} cr=${h.guard.compression.toFixed(2)} ${h.ms}ms`);
  console.log("   ", h.pieces.slice(0, 8).map((p) => `${JSON.stringify(p.text)}:${p.p.toFixed(2)}`).join(" "));
}
