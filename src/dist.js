// Seeded randomness and a service-time model with a rare slow mode.

// mulberry32: small, fast, and good enough for simulation. Same seed, same run.
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Standard normal by Box-Muller. 1 - u keeps log() away from zero.
export function normal(rand) {
  const u = 1 - rand(), v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export const exponential = (rand, mean = 1) => -Math.log(1 - rand()) * mean;

// One server's response time in ms. Most requests are lognormal around
// `median`; with probability `slowP` the request lands in a hiccup (GC pause,
// compaction, a noisy neighbour) and takes around `slowMs`. Dean and Barroso
// list these sources of variability in The Tail at Scale, CACM 2013.
export function latencyModel({ median = 10, sigma = 0.35, slowP = 0.01, slowMs = 1000 } = {}) {
  return (rand) => {
    const slow = rand() < slowP;
    return (slow ? slowMs : median) * Math.exp(sigma * normal(rand));
  };
}

// Nearest-rank percentile on an ascending array, q in (0, 1].
export function percentile(sorted, q) {
  if (!sorted.length) return NaN;
  const i = Math.min(sorted.length, Math.max(1, Math.ceil(q * sorted.length)));
  return sorted[i - 1];
}

export function summarize(samples) {
  const s = Float64Array.from(samples).sort();
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  return {
    n: s.length,
    mean,
    p50: percentile(s, 0.5),
    p95: percentile(s, 0.95),
    p99: percentile(s, 0.99),
    p999: percentile(s, 0.999),
    max: s[s.length - 1],
  };
}
