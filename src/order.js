// Why a fan-out is as slow as its slowest leaf. A request sent to n servers is
// only finished when the last one answers, so its time is the maximum of n
// independent latencies. fanout.js gives the chance that response is slow; this
// gives how slow, on paper, so you can size a fan-out without simulating it.
//
// For independent exponential service (mean `mean`), the expected maximum of n
// is mean * H_n, where H_n is the n-th harmonic number. H_n grows like ln(n),
// so doubling the fan-out adds only about mean * ln(2) to the expected tail,
// not double it. For a uniform[0, max] the expected maximum is max * n/(n+1),
// creeping up towards the cap. These are standard order-statistics results
// (David & Nagaraja, Order Statistics, 3rd ed.).
//
// The quantiles use the same idea for any base distribution F: since all n must
// finish, P(max <= x) = F(x)^n, so the q-quantile of the maximum is the base
// (q^(1/n))-quantile of one server. That is why the p99 of a 100-way fan-out
// lands far out in a single server's tail.

export function harmonic(n) {
  if (!Number.isInteger(n) || n < 1) throw new RangeError("n must be a positive integer");
  let sum = 0;
  for (let k = 1; k <= n; k++) sum += 1 / k;
  return sum;
}

// E[max of n iid Exponential(mean)].
export function expectedMaxExponential(n, mean = 1) {
  if (!(mean > 0)) throw new RangeError("mean must be positive");
  return mean * harmonic(n);
}

// E[max of n iid Uniform(0, max)].
export function expectedMaxUniform(n, max = 1) {
  if (!Number.isInteger(n) || n < 1) throw new RangeError("n must be a positive integer");
  return (max * n) / (n + 1);
}

// The q-quantile (0 < q < 1) of the max of n iid Exponential(mean): the base
// (q^(1/n))-quantile, which is -mean * ln(1 - q^(1/n)).
export function quantileMaxExponential(n, q, mean = 1) {
  if (!Number.isInteger(n) || n < 1) throw new RangeError("n must be a positive integer");
  if (!(q > 0 && q < 1)) throw new RangeError("q must be in (0, 1)");
  if (!(mean > 0)) throw new RangeError("mean must be positive");
  return -mean * Math.log(1 - Math.pow(q, 1 / n));
}
