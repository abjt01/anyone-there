import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { KINDS, REGISTER, identify } from "../../lib/register.ts";

const sweep = JSON.parse(fs.readFileSync(new URL("../../data/sweep.json", import.meta.url), "utf8")) as {
  rows: { lang: string; text: string; outcome: string }[];
};

test("every spirit in the register really turned up in the sweep", () => {
  for (const g of REGISTER) {
    const seen = sweep.rows.filter((r) => g.match.test(r.text.trim()));
    assert.ok(seen.length > 0, `${g.id} never heard`);
  }
});

test("register ids are unique and every entry has a meaning and a kind", () => {
  assert.equal(new Set(REGISTER.map((g) => g.id)).size, REGISTER.length);
  for (const g of REGISTER) {
    assert.ok(g.meaning.length > 3, g.id);
    assert.ok(KINDS[g.kind], g.id);
  }
});

test("identify finds the named ones", () => {
  assert.equal(identify("Редактор субтитров А.Синецкая Корректор А.Егорова", "ru")?.id, "subtitry");
  assert.equal(identify("TV GELDERLAND 2020.")?.id, "gelderland");
  assert.equal(identify("you")?.id, "you");
  assert.equal(identify("You.")?.id, "you");
  assert.equal(identify("  ")?.id, undefined);
  assert.equal(identify("the cat sat on the mat"), null);
});

test("a chant needs to repeat before it counts", () => {
  assert.equal(identify("Shree")?.id, undefined);
  assert.equal(identify("Shree, Shree, Shree, Shree")?.id, "shree");
});

test("the named credits are the ones Whisper's own guard lets through", () => {
  const kept = (re: RegExp) => sweep.rows.filter((r) => re.test(r.text)).every((r) => r.outcome === "kept");
  assert.ok(kept(/TV GELDERLAND/));
  assert.ok(kept(/Редактор субтитров/));
});
