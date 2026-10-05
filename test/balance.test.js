import test from "node:test";
import assert from "node:assert/strict";
import { supermarketTime, simulateBalance } from "../src/balance.js";

test("closed form: M/M/1 for d = 1, and the d = 2 series", () => {
  assert.ok(Math.abs(supermarketTime(0.9, 1) - 10) < 1e-9);
  // lambda = 0.5, d = 2: exponents 0, 2, 6, 14, ... -> 1 + 0.25 + 0.015625 + ...
  assert.ok(Math.abs(supermarketTime(0.5, 2) - (1 + 0.25 + 0.5 ** 6 + 0.5 ** 14 + 0.5 ** 30)) < 1e-9);
  assert.ok(supermarketTime(0.99, 2) < supermarketTime(0.99, 1) / 10);
});

test("random and two-choice simulations land on the closed form", () => {
  for (const [policy, d] of [["random", 1], ["two", 2], ["three", 3]]) {
    const r = simulateBalance({ servers: 100, lambda: 0.9, jobs: 300000, policy, seed: 3 });
    const want = supermarketTime(0.9, d);
    assert.ok(Math.abs(r.mean - want) / want < 0.1, `${policy}: ${r.mean} vs ${want}`);
  }
});

test("two choices beat random by a wide margin at 90% load; a third adds little", () => {
  const run = (policy) => simulateBalance({ servers: 100, lambda: 0.9, jobs: 200000, policy, seed: 4 });
  const random = run("random"), two = run("two"), three = run("three"), shortest = run("shortest");
  assert.ok(two.mean * 3 < random.mean, `${random.mean} vs ${two.mean}`);
  assert.ok(two.p99 * 4 < random.p99, `p99 ${random.p99} vs ${two.p99}`);
  assert.ok(two.mean - three.mean < random.mean - two.mean);
  assert.ok(shortest.mean <= three.mean + 0.05);
});

test("round robin sits between random and two choices", () => {
  const run = (policy) => simulateBalance({ servers: 50, lambda: 0.9, jobs: 150000, policy, seed: 5 });
  const random = run("random"), rr = run("roundRobin"), two = run("two");
  assert.ok(rr.mean < random.mean && rr.mean > two.mean, `${random.mean} ${rr.mean} ${two.mean}`);
});

test("max queue is measured for policies that never sample queue lengths", () => {
  const r = simulateBalance({ servers: 20, lambda: 0.5, jobs: 20000, policy: "roundRobin", seed: 6 });
  assert.ok(r.maxQueue < 20, `max queue ${r.maxQueue}`);
});
