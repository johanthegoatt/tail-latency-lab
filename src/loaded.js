import { rng, exponential, latencyModel, summarize } from "./dist.js";

// Mean of latencyModel: a lognormal with parameter sigma has mean e^(sigma^2 / 2)
// times its median, in both the normal and the slow mode.
export function meanService({ median = 10, sigma = 0.35, slowP = 0.01, slowMs = 1000 } = {}) {
  return Math.exp((sigma * sigma) / 2) * ((1 - slowP) * median + slowP * slowMs);
}

// Hedging on loaded FIFO replicas. Hedges are not free here: a backup waits in
// the second replica's queue and holds it until one copy answers, and every
// later request on that replica waits behind it. Requests arrive as a Poisson
// stream sized so that, before hedging, each replica is busy `load` of the time.
//
// `delay` is ms after arrival; 0 duplicates every request up front, Infinity
// never hedges. A backup that loses is cancelled when the primary answers
// (immediately if it has not started yet). A primary that loses runs to
// completion, so the extra work counted is an upper bound.
export function simulateLoaded({ replicas = 10, load = 0.5, requests = 50000, delay = Infinity, seed = 1, warmup = 0.1, ...model } = {}) {
  const rand = rng(seed), draw = latencyModel(model);
  const rate = (load * replicas) / meanService(model); // requests per ms
  const freeAt = new Float64Array(replicas);
  const pick = (not) => {
    let s = Math.floor(rand() * (replicas - (not >= 0 ? 1 : 0)));
    if (not >= 0 && s >= not) s++;
    return s;
  };

  const done = new Float64Array(requests), arrivedAt = new Float64Array(requests);
  const server = new Int32Array(requests);
  let primaryWork = 0, backupWork = 0, fired = 0;
  // Hedge checks fire at arrival + delay, so they come due in arrival order and
  // a FIFO of pending ids replaces a priority queue.
  const pending = [];
  let ph = 0;

  const hedge = (id, t) => {
    if (done[id] <= t) return;
    fired++;
    const j = pick(server[id]);
    const start = Math.max(t, freeAt[j]);
    const svc = draw(rand);
    if (start + svc < done[id]) {
      done[id] = start + svc;
      freeAt[j] = done[id];
      backupWork += svc;
    } else if (start < done[id]) {
      backupWork += done[id] - start;
      freeAt[j] = done[id];
    }
  };

  let now = 0;
  for (let id = 0; id < requests; id++) {
    now += exponential(rand, 1 / rate);
    while (ph < pending.length && arrivedAt[pending[ph]] + delay <= now) {
      const h = pending[ph++];
      hedge(h, arrivedAt[h] + delay);
    }
    const i = pick(-1);
    const svc = draw(rand);
    const start = Math.max(now, freeAt[i]);
    freeAt[i] = start + svc;
    primaryWork += svc;
    arrivedAt[id] = now;
    done[id] = freeAt[i];
    server[id] = i;
    if (delay === 0) hedge(id, now);
    else if (delay < Infinity) pending.push(id);
  }
  while (ph < pending.length) { const h = pending[ph++]; hedge(h, arrivedAt[h] + delay); }

  const skip = Math.floor(requests * warmup);
  const times = new Float64Array(requests - skip);
  for (let id = skip; id < requests; id++) times[id - skip] = done[id] - arrivedAt[id];
  return {
    delay,
    load,
    ...summarize(times),
    extraRequests: fired / requests,
    extraWork: backupWork / primaryWork,
  };
}
