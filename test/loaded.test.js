import test from "node:test";
import assert from "node:assert/strict";
import { meanService, simulateLoaded } from "../src/loaded.js";
import { rng, latencyModel } from "../src/dist.js";

const model = { median: 10, sigma: 0.35, slowP: 0.01, slowMs: 1000 };

test("meanService matches the sampled mean", () => {
  const r = rng(1), draw = latencyModel(model);
  let s = 0;
  for (let i = 0; i < 400000; i++) s += draw(r);
  assert.ok(Math.abs(s / 400000 - meanService(model)) / meanService(model) < 0.03);
});

test("at 30% load a p95 hedge cuts p99.9 and costs a few percent of work", () => {
  const base = simulateLoaded({ ...model, load: 0.3, seed: 2 });
  const p95 = simulateLoaded({ ...model, load: 0.3, seed: 2, delay: base.p95 });
  assert.ok(p95.p999 < base.p999 / 2, `${base.p999} -> ${p95.p999}`);
  assert.ok(p95.p99 < base.p99, `${base.p99} -> ${p95.p99}`);
  assert.ok(p95.extraWork < 0.1, `extra work ${p95.extraWork}`);
});

test("at 60% load, duplicating every request moves the cost into the median", () => {
  const base = simulateLoaded({ ...model, load: 0.6, seed: 3 });
  const p95 = simulateLoaded({ ...model, load: 0.6, seed: 3, delay: base.p95 });
  const dup = simulateLoaded({ ...model, load: 0.6, seed: 3, delay: 0 });
  assert.equal(dup.extraRequests, 1);
  assert.ok(dup.extraWork > 0.3, `dup work ${dup.extraWork}`);
  assert.ok(dup.p50 > base.p50 * 2, `dup p50 ${dup.p50} vs ${base.p50}`);
  assert.ok(p95.p50 < base.p50 * 1.3, `p95 hedge p50 ${p95.p50} vs ${base.p50}`);
  assert.ok(p95.extraWork < 0.1, `p95 hedge work ${p95.extraWork}`);
});
