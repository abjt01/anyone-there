import assert from "node:assert/strict";
import { test } from "node:test";
import { Medium, pieces, seeded, softmax, topK } from "../../lib/medium.ts";

test("softmax sums to one and ignores banned tokens", () => {
  const p = softmax([1, 2, -Infinity, 3]);
  assert.ok(Math.abs(p.reduce((a, b) => a + b, 0) - 1) < 1e-12);
  assert.equal(p[2], 0);
  assert.ok(p[3] > p[1] && p[1] > p[0]);
});

test("a lower temperature makes the favourite more likely", () => {
  assert.ok(softmax([1, 2], 0.5)[1] > softmax([1, 2], 1)[1]);
});

test("topK keeps the k likeliest, best first", () => {
  assert.deepEqual(
    topK([0.1, 0.4, 0, 0.3, 0.2], 3).map((a) => a.id),
    [1, 3, 4],
  );
});

test("seeded random numbers repeat for the same seed", () => {
  const a = seeded(7), b = seeded(7), c = seeded(8);
  const xs = [a(), a(), a()];
  assert.deepEqual(xs, [b(), b(), b()]);
  assert.notDeepEqual(xs, [c(), c(), c()]);
  for (const x of xs) assert.ok(x >= 0 && x < 1);
});

test("greedy: the medium takes the likeliest token and remembers the runners-up", () => {
  const m = new Medium({ keep: 2 });
  const logits = new Float32Array([0, 3, 1, 2]);
  assert.equal(m.choose(logits), 1);
  assert.deepEqual(m.steps[0].alts.map((a) => a.id), [3, 2]);
  // everything else is closed off, so the library's own greedy pick agrees
  assert.deepEqual([...logits].map((x) => x === -Infinity), [true, false, true, true]);
});

test("banned tokens are never spoken, and banFirst only applies to the first step", () => {
  const m = new Medium({ ban: [1], banFirst: [3] });
  assert.equal(m.choose(new Float32Array([0, 9, 1, 5])), 2);
  assert.equal(m.choose(new Float32Array([0, 9, 1, 5])), 3);
});

test("probabilities are measured after the ban", () => {
  const m = new Medium({ ban: [0] });
  m.choose(new Float32Array([10, 0, 0]));
  assert.ok(Math.abs(m.steps[0].p - 0.5) < 1e-9);
});

test("sampling with the same seed is the same séance", () => {
  const run = (seed: number) => {
    const m = new Medium({ temperature: 1, random: seeded(seed) });
    return Array.from({ length: 30 }, () => m.choose(new Float32Array([1, 1, 1, 1, 1])));
  };
  assert.deepEqual(run(3), run(3));
  assert.notDeepEqual(run(3), run(4));
  assert.ok(new Set(run(3)).size > 1);
});

test("pieces join byte tokens into whole characters", () => {
  // a toy byte-level tokenizer: ids are UTF-8 bytes, 1000+ are special
  const decode = (ids: number[]) => new TextDecoder().decode(Uint8Array.from(ids.filter((i) => i < 256)));
  const bytes = [...new TextEncoder().encode("अ b")];
  const steps = [1000, ...bytes, 1001].map((id, i) => ({ id, p: 0.5 + i / 100, alts: [] }));
  const out = pieces(steps, decode, (id) => id >= 1000);
  assert.deepEqual(out.map((p) => p.text), ["अ", " ", "b"]);
  assert.equal(out[0].tokens, 3);
  assert.ok(Math.abs(out[0].p - 0.51 * 0.52 * 0.53) < 1e-9);
});

test("an unfinished character at the end is left out", () => {
  const decode = (ids: number[]) => new TextDecoder().decode(Uint8Array.from(ids));
  const [a, b] = new TextEncoder().encode("ा");
  const out = pieces([{ id: 104, p: 1, alts: [] }, { id: a, p: 1, alts: [] }, { id: b, p: 1, alts: [] }].slice(0, 2), decode, () => false);
  assert.deepEqual(out.map((p) => p.text), ["h"]);
});
