import test from "node:test";
import assert from "node:assert/strict";
import { rng, latencyModel } from "../src/dist.js";
import { calibrate, simulateHedge, hedgedSurvival } from "../src/hedge.js";

const model = { median: 10, sigma: 0.35, slowP: 0.01, slowMs: 1000 };

test("a p95 hedge fires on about 5% of requests", () => {
  const r = simulateHedge({ ...model, seed: 1 });
  assert.ok(Math.abs(r.extraRequests - 0.05) < 0.01, `${r.extraRequests}`);
  assert.ok(r.extraWork < 0.05, `extra work ${r.extraWork}`);
});

test("hedging cuts p99.9 by an order of magnitude and leaves the median alone", () => {
  const r = simulateHedge({ ...model, seed: 2 });
  assert.equal(r.hedged.p50, r.plain.p50);
  assert.ok(r.hedged.p999 * 10 < r.plain.p999, `${r.plain.p999} -> ${r.hedged.p999}`);
});

test("simulated hedged tail matches P(A > t) * P(B > t - d)", () => {
  const rand = rng(5), draw = latencyModel(model);
  const ref = Float64Array.from({ length: 100000 }, () => draw(rand)).sort();
  const below = (arr, t) => {
    let lo = 0, hi = arr.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] <= t) lo = m + 1; else hi = m; }
    return lo;
  };
  const survival = (t) => 1 - below(ref, t) / ref.length;
  const d = calibrate(0.95, model);
  const sf = hedgedSurvival(survival, d);
  const got = simulateHedge({ ...model, seed: 6, requests: 100000, delay: d }).samples.hedged.sort();
  for (const t of [d / 2, d * 1.5, d * 3, 200]) {
    const empirical = 1 - below(got, t) / got.length;
    assert.ok(Math.abs(empirical - sf(t)) < 0.004, `t=${t.toFixed(1)}: ${empirical} vs ${sf(t)}`);
  }
});
