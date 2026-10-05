import test from "node:test";
import assert from "node:assert/strict";
import { slowShare, fanoutFor, simulateFanout } from "../src/fanout.js";

test("1% slow leaves make 63% of 100-way requests slow", () => {
  assert.equal(Number(slowShare(0.01, 100).toFixed(3)), 0.634);
  assert.ok(Math.abs(slowShare(0.01, 1) - 0.01) < 1e-12);
  assert.equal(slowShare(0, 1000), 0);
});

test("fan-out at which half of requests are slow", () => {
  assert.equal(fanoutFor(0.01, 0.5), 69);
  assert.ok(slowShare(0.01, fanoutFor(0.01, 0.5)) >= 0.5);
  assert.ok(slowShare(0.01, fanoutFor(0.01, 0.5) - 1) < 0.5);
});

test("simulated fan-out matches the closed form", () => {
  for (const fanout of [1, 10, 100]) {
    const r = simulateFanout({ fanout, requests: 4000, seed: 2, slowP: 0.01, threshold: 100 });
    assert.ok(Math.abs(r.requestSlow - r.predicted) < 0.03, `n=${fanout}: ${r.requestSlow} vs ${r.predicted}`);
  }
});

test("the leaf p99 becomes the request median at fan-out 100", () => {
  const r = simulateFanout({ fanout: 100, requests: 3000, seed: 4, slowP: 0.01 });
  assert.ok(r.leaf.p50 < 20);
  assert.ok(r.request.p50 > 300, `request p50 ${r.request.p50}`);
});
