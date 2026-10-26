// The real model, in Node: the same files the page loads, the same code path.
// These are the claims the app and the post make, checked against Whisper itself.
import assert from "node:assert/strict";
import path from "node:path";
import { before, test } from "node:test";
import { SpiritBox } from "../lib/engine.ts";
import { noise } from "../lib/noise.ts";
import { identify } from "../lib/register.ts";
import { readWav } from "./helpers/wav.ts";

let box: SpiritBox;
before(async () => {
  box = await SpiritBox.load({ localPath: path.resolve("public/models") + "/", device: "cpu" });
});

test("an empty room in Dutch: a TV channel's credit, and Whisper's guard lets it through", async () => {
  const h = await box.listen(noise("pink", { seconds: 8, db: -55, seed: 1 }), { language: "nl" });
  assert.match(h.text, /TV GELDERLAND/);
  assert.ok(h.noSpeech > 0.8, `no-speech ${h.noSpeech}`);
  assert.equal(h.guard.outcome, "kept");
  assert.equal(identify(h.text, "nl")?.kind, "credit");
});

test("Russian: two subtitle editors' names, said with confidence", async () => {
  const h = await box.listen(noise("white", { seconds: 8, db: -70, seed: 1 }), { language: "ru" });
  assert.match(h.text, /^Редактор субтитров/);
  assert.ok(h.avgLogprob > -1, `avg logprob ${h.avgLogprob}`);
  assert.equal(h.guard.outcome, "kept");
  // The first sound is a long shot. Once it's started, the job titles are near certain;
  // the surnames are where it wavers (the sweep heard two different editors).
  const shown = JSON.stringify(h.pieces.map((p) => [p.text, p.p.toFixed(2)]));
  assert.ok(h.pieces[0].p < 0.2, shown);
  const sure = (from: number, to: number) => h.pieces.slice(from, to).every((p) => p.p > 0.9);
  assert.equal(h.pieces.slice(2, 9).map((p) => p.text).join(""), "актор субтитров");
  assert.ok(sure(2, 9), shown);
  const corrector = h.pieces.findIndex((p) => p.text === " Кор");
  assert.ok(corrector > 0 && sure(corrector, corrector + 3), shown);
  const surname = h.pieces.slice(11, corrector);
  assert.ok(Math.min(...surname.map((p) => p.p)) < 0.5, shown);
});

test("digital silence in English: \"you\"", async () => {
  const h = await box.listen(noise("silence", { seconds: 8 }), { language: "en" });
  assert.equal(h.text, "you");
  assert.ok(h.noSpeech > 0.9);
});

test("left to choose, the static sounds like Norwegian Nynorsk, and says a number", async () => {
  const h = await box.listen(noise("pink", { seconds: 8, db: -40, seed: 1 }), { language: null });
  assert.equal(h.languages[0].code, "nn");
  assert.equal(h.language.code, "nn");
  assert.equal(identify(h.text)?.id, "one-five");
});

test("brackets are banned: the spirits have to use words", async () => {
  // without the ban, Whisper base says "[water running]" to hiss
  for (const lang of ["en", "es", "de"]) {
    const h = await box.listen(noise("white", { seconds: 8, db: -40, seed: 2 }), { language: lang });
    assert.doesNotMatch(h.text, /[()[\]♪*]/, `${lang}: ${h.text}`);
  }
});

test("a chant is cut off cleanly, with no broken character at the end", async () => {
  const h = await box.listen(noise("white", { seconds: 8, db: -46, seed: 1 }), { language: "hi" });
  assert.doesNotMatch(h.text, /�/);
  assert.ok(h.text.length > 0);
});

test("a living voice: Whisper hears real words and knows someone spoke", async () => {
  const { rate, samples } = readWav("test/fixtures/hello.wav");
  assert.equal(rate, 16000);
  const h = await box.listen(samples, { language: "en" });
  assert.match(h.text, /anyone there/i);
  assert.match(h.text, /kitchen/i);
  assert.ok(h.noSpeech < 0.1, `no-speech ${h.noSpeech}`);
  assert.equal(h.guard.outcome, "kept");
});

test("the same nothing gives the same spirit, every time", async () => {
  const a = await box.listen(noise("brown", { seconds: 8, db: -55, seed: 2 }), { language: "ta" });
  const b = await box.listen(noise("brown", { seconds: 8, db: -55, seed: 2 }), { language: "ta" });
  assert.equal(a.text, b.text);
  assert.deepEqual(a.pieces.map((p) => p.p), b.pieces.map((p) => p.p));
});

test("sampling with a seed is repeatable too, and differs from the greedy pick", async () => {
  const audio = noise("pink", { seconds: 8, db: -55, seed: 3 });
  const a = await box.listen(audio, { language: "zh", temperature: 1, seed: 9 });
  const b = await box.listen(audio, { language: "zh", temperature: 1, seed: 9 });
  assert.equal(a.text, b.text);
  const texts = new Set<string>();
  for (const seed of [1, 2, 3, 4, 5]) texts.add((await box.listen(audio, { language: "zh", temperature: 1, seed })).text);
  assert.ok(texts.size > 1, [...texts].join(" | "));
});
