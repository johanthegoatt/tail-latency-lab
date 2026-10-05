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

test("duplicating every request wins at 20% load and collapses at 70%", () => {
  const run = (load, delay) => simulateLoaded({ ...model, load, seed: 3, requests: 100000, delay });
  const light = run(0.2), lightDup = run(0.2, 0);
  assert.ok(lightDup.p99 * 3 < light.p99, `20%: ${light.p99} -> ${lightDup.p99}`);
  assert.ok(lightDup.p50 < light.p50);

  const heavy = run(0.7), heavyDup = run(0.7, 0), heavyHedge = run(0.7, heavy.p95);
  assert.equal(heavyDup.extraRequests, 1);
  assert.ok(heavyDup.extraWork > 0.3, `dup work ${heavyDup.extraWork}`);
  assert.ok(heavyDup.p50 > heavy.p50 * 5, `70% p50: ${heavy.p50} -> ${heavyDup.p50}`);
  assert.ok(heavyHedge.p999 < heavy.p999, `70% p95 hedge p99.9: ${heavy.p999} -> ${heavyHedge.p999}`);
  assert.ok(heavyHedge.extraWork < 0.06, `p95 hedge work ${heavyHedge.extraWork}`);
});
