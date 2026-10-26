import assert from "node:assert/strict";
import { test } from "node:test";
import { compressionRatio, guardVerdict } from "../../lib/guard.ts";

test("compression ratio matches Python's zlib, which openai/whisper uses", async () => {
  // len(b) / len(zlib.compress(b)), worked out in Python
  const cases: [string, number][] = [
    ["you", 0.2727272727272727],
    ["TV GELDERLAND 2020.", 0.7037037037037037],
    ["Shree, Shree, Shree, Shree, Shree, Shree, Shree, Shree, Shree, Shree, ", 3.888888888888889],
    ["அம்மா, அம்மா, அம்மா, அம்மா, அம்மா, அம்மா, அம்மா, அம்ம", 4.851851851851852],
  ];
  for (const [text, want] of cases) assert.ok(Math.abs((await compressionRatio(text)) - want) < 1e-9, text);
  assert.equal(await compressionRatio(""), 0);
});

test("dropped: nobody talking and the words unsure", async () => {
  const v = await guardVerdict({ text: "Время", noSpeech: 0.95, avgLogprob: -2.1 });
  assert.equal(v.outcome, "dropped");
  assert.ok(v.silent && v.unsure);
});

test("kept: nobody talking, but the words are confident (the credits get through)", async () => {
  const v = await guardVerdict({ text: "TV GELDERLAND 2020.", noSpeech: 0.95, avgLogprob: -0.31 });
  assert.equal(v.outcome, "kept");
  assert.equal(v.silent, false);
});

test("retried: a chant is too repetitive", async () => {
  const v = await guardVerdict({ text: "Shree, Shree, Shree, Shree, Shree, Shree, Shree, Shree, Shree, Shree, ", noSpeech: 0.4, avgLogprob: -0.2 });
  assert.equal(v.outcome, "retried");
  assert.ok(v.repetitive);
});

test("retried: unsure words with a real voice in the room", async () => {
  assert.equal((await guardVerdict({ text: "hello", noSpeech: 0.1, avgLogprob: -1.5 })).outcome, "retried");
});

test("nothing said is dropped", async () => {
  assert.equal((await guardVerdict({ text: "", noSpeech: 0.1, avgLogprob: -0.1 })).outcome, "dropped");
});
