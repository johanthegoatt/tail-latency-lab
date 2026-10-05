import test from "node:test";
import assert from "node:assert/strict";
import { rng, normal, exponential, latencyModel, percentile, summarize } from "../src/dist.js";

test("rng is deterministic per seed and in [0, 1)", () => {
  const a = rng(7), b = rng(7), c = rng(8);
  const xs = Array.from({ length: 1000 }, a);
  assert.deepEqual(xs.slice(0, 5), Array.from({ length: 5 }, b));
  assert.notEqual(xs[0], c());
  assert.ok(xs.every((x) => x >= 0 && x < 1));
});

test("normal and exponential have the right moments", () => {
  const r = rng(3), n = 200000;
  let s = 0, s2 = 0, e = 0;
  for (let i = 0; i < n; i++) { const z = normal(r); s += z; s2 += z * z; e += exponential(r, 2); }
  assert.ok(Math.abs(s / n) < 0.01);
  assert.ok(Math.abs(s2 / n - 1) < 0.02);
  assert.ok(Math.abs(e / n - 2) < 0.03);
});

test("nearest-rank percentile", () => {
  const s = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  assert.equal(percentile(s, 0.5), 5);
  assert.equal(percentile(s, 0.9), 9);
  assert.equal(percentile(s, 0.99), 10);
  assert.equal(percentile(s, 0.01), 1);
  assert.ok(Number.isNaN(percentile([], 0.5)));
});

test("the slow mode shows up at p99.9 but not at the median", () => {
  const r = rng(1), draw = latencyModel({ median: 10, slowP: 0.01, slowMs: 1000 });
  const s = summarize(Array.from({ length: 100000 }, () => draw(r)));
  assert.ok(Math.abs(s.p50 - 10) < 0.5, `p50 ${s.p50}`);
  assert.ok(s.p95 < 30, `p95 ${s.p95}`);
  assert.ok(s.p999 > 500, `p999 ${s.p999}`);
});
