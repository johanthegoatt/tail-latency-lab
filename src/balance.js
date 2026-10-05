import { rng, exponential, summarize } from "./dist.js";

// The supermarket model (Mitzenmacher, The Power of Two Choices in Randomized
// Load Balancing, IEEE TPDS 2001): jobs arrive as a Poisson stream at rate
// lambda * n onto n FIFO servers with exponential service of mean 1. Each job
// samples d servers and joins the shortest queue among them.

// Expected time in system as n grows, from the fixed point in which the share
// of servers holding at least i jobs is lambda^((d^i - 1) / (d - 1)):
//   T_d = sum over i >= 1 of lambda^((d^i - d) / (d - 1))
// For d = 1 this is the M/M/1 result 1 / (1 - lambda).
export function supermarketTime(lambda, d) {
  if (d === 1) return 1 / (1 - lambda);
  let t = 0;
  for (let i = 1; i < 64; i++) {
    const term = lambda ** ((d ** i - d) / (d - 1));
    t += term;
    if (term < 1e-12) break;
  }
  return t;
}

export const POLICIES = ["random", "roundRobin", "two", "three", "shortest"];

// Discrete-event run. Each server keeps the departure times of its jobs in
// FIFO order; queue length at an arrival is the count not yet departed.
export function simulateBalance({ servers = 100, lambda = 0.9, jobs = 200000, policy = "two", seed = 1, warmup = 0.1 } = {}) {
  const rand = rng(seed);
  const deps = Array.from({ length: servers }, () => []);
  const head = new Int32Array(servers);
  const len = (s, now) => {
    const q = deps[s];
    while (head[s] < q.length && q[head[s]] <= now) head[s]++;
    if (head[s] > 1024 && head[s] * 2 > q.length) { q.splice(0, head[s]); head[s] = 0; }
    return q.length - head[s];
  };
  const pickOf = (d, now) => {
    let best = Math.floor(rand() * servers), bl = len(best, now);
    for (let k = 1; k < d; k++) {
      const s = Math.floor(rand() * servers), l = len(s, now);
      if (l < bl) { best = s; bl = l; }
    }
    return best;
  };
  let rr = 0;
  const choose = (now) => {
    switch (policy) {
      case "random": return pickOf(1, now);
      case "two": return pickOf(2, now);
      case "three": return pickOf(3, now);
      case "roundRobin": return rr++ % servers;
      case "shortest": {
        let best = 0, bl = Infinity;
        for (let s = 0; s < servers; s++) { const l = len(s, now); if (l < bl) { best = s; bl = l; } }
        return best;
      }
      default: throw new Error(`unknown policy ${policy}`);
    }
  };

  const skip = Math.floor(jobs * warmup);
  const times = new Float64Array(jobs - skip);
  let now = 0, maxQueue = 0;
  for (let j = 0; j < jobs; j++) {
    now += exponential(rand, 1 / (lambda * servers));
    const s = choose(now);
    const q = deps[s];
    const queued = len(s, now);
    if (queued > maxQueue) maxQueue = queued;
    const start = queued ? Math.max(now, q[q.length - 1]) : now;
    const done = start + exponential(rand, 1);
    q.push(done);
    if (j >= skip) times[j - skip] = done - now;
  }
  return { policy, lambda, servers, ...summarize(times), maxQueue, theory: theoryFor(policy, lambda) };
}

function theoryFor(policy, lambda) {
  const d = { random: 1, two: 2, three: 3 }[policy];
  return d ? supermarketTime(lambda, d) : null;
}
