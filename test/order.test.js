import test from "node:test";
import assert from "node:assert/strict";
import {
  harmonic, expectedMaxExponential, expectedMaxUniform, quantileMaxExponential,
} from "../src/order.js";
import { rng, exponential } from "../src/dist.js";

const close = (a, b, tol) => Math.abs(a - b) <= tol;

test("harmonic numbers are exact for small n", () => {
  assert.equal(harmonic(1), 1);
  assert.ok(close(harmonic(4), 1 + 1 / 2 + 1 / 3 + 1 / 4, 1e-12));
  assert.throws(() => harmonic(0), RangeError);
});

test("doubling the fan-out adds about mean*ln(2) to the expected max", () => {
  const mean = 10;
  const add = expectedMaxExponential(200, mean) - expectedMaxExponential(100, mean);
  // H_2n - H_n -> ln(2); at n=100 it is already within a whisker of mean*ln2.
  assert.ok(close(add, mean * Math.log(2), 0.1), `added ${add}`);
});

test("expected max of uniforms climbs towards the cap", () => {
  assert.equal(expectedMaxUniform(1), 0.5);
  assert.ok(expectedMaxUniform(99, 1) > 0.98 && expectedMaxUniform(99, 1) < 1);
});

test("the exponential expected-max formula matches a seeded Monte Carlo run", () => {
  const rand = rng(5), n = 20, mean = 10, trials = 200000;
  let sum = 0;
  for (let t = 0; t < trials; t++) {
    let mx = 0;
    for (let i = 0; i < n; i++) mx = Math.max(mx, exponential(rand, mean));
    sum += mx;
  }
  const empirical = sum / trials;
  assert.ok(close(empirical, expectedMaxExponential(n, mean), 0.2 * mean), `empirical ${empirical}`);
});

test("the p99 of a fan-out lands far out in one server's tail", () => {
  const mean = 10;
  const one = quantileMaxExponential(1, 0.99, mean);        // = -mean*ln(0.01)
  const hundred = quantileMaxExponential(100, 0.99, mean);
  assert.ok(close(one, -mean * Math.log(0.01), 1e-9));
  assert.ok(hundred > one);                                 // the max's p99 is worse
  // P(max <= x) = F(x)^n = q by construction, checked by simulation.
  const rand = rng(9), n = 100, trials = 100000;
  const x = quantileMaxExponential(n, 0.99, mean);
  let under = 0;
  for (let t = 0; t < trials; t++) {
    let mx = 0;
    for (let i = 0; i < n; i++) mx = Math.max(mx, exponential(rand, mean));
    if (mx <= x) under++;
  }
  assert.ok(close(under / trials, 0.99, 0.01), `coverage ${under / trials}`);
});

test("quantiles reject out-of-range inputs", () => {
  assert.throws(() => quantileMaxExponential(10, 0, 1), RangeError);
  assert.throws(() => quantileMaxExponential(10, 1, 1), RangeError);
});
