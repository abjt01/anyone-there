import assert from "node:assert/strict";
import { test } from "node:test";
import { NOISE_KINDS, level, noise } from "../../lib/noise.ts";

test("every kind of noise comes out at the loudness asked for", () => {
  for (const kind of NOISE_KINDS) {
    if (kind === "silence") continue;
    for (const db of [-70, -40]) assert.ok(Math.abs(level(noise(kind, { seconds: 1, db })) - db) < 1e-6, `${kind} ${db}`);
  }
});

test("silence is silent", () => {
  const x = noise("silence", { seconds: 0.5 });
  assert.equal(x.length, 8000);
  assert.equal(level(x), -Infinity);
});

test("the same seed is the same hiss, another seed is another", () => {
  assert.deepEqual(noise("pink", { seconds: 0.1, seed: 2 }), noise("pink", { seconds: 0.1, seed: 2 }));
  assert.notDeepEqual(noise("pink", { seconds: 0.1, seed: 2 }), noise("pink", { seconds: 0.1, seed: 3 }));
});

test("pink and brown noise lean towards the low end, white doesn't", () => {
  // the share of energy in sample-to-sample change is lower for darker noise
  const roughness = (x: Float32Array) => {
    let d = 0, s = 0;
    for (let i = 1; i < x.length; i++) {
      d += (x[i] - x[i - 1]) ** 2;
      s += x[i] ** 2;
    }
    return d / s;
  };
  const w = roughness(noise("white", { seconds: 1 }));
  const p = roughness(noise("pink", { seconds: 1 }));
  const b = roughness(noise("brown", { seconds: 1 }));
  assert.ok(w > p && p > b, `${w} ${p} ${b}`);
});
