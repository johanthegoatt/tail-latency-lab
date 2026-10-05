import { rng, latencyModel, summarize, percentile } from "./dist.js";

// Latency at quantile q of the model, measured on a calibration run with its
// own seed so the hedge delay is not tuned on the samples it is scored on.
export function calibrate(q, model = {}, { samples = 20000, seed = 999 } = {}) {
  const rand = rng(seed), draw = latencyModel(model);
  const s = Float64Array.from({ length: samples }, () => draw(rand)).sort();
  return percentile(s, q);
}

// Hedged requests (Dean and Barroso, The Tail at Scale, CACM 2013): send to
// one replica, and only if no reply has come back after `delay` ms send the
// same request to a second replica. Take whichever answers first and cancel
// the other. With delay at the p95 the hedge fires on about 5% of requests.
//
// Replicas here are independent and unloaded; queue.js adds the load the
// extra requests create.
export function simulateHedge({ requests = 20000, seed = 1, delay, delayQ = 0.95, ...model } = {}) {
  const d = delay ?? calibrate(delayQ, model);
  const rand = rng(seed), draw = latencyModel(model);
  const plain = new Float64Array(requests), hedged = new Float64Array(requests);
  let fired = 0, primaryWork = 0, backupWork = 0;
  for (let i = 0; i < requests; i++) {
    const a = draw(rand);
    plain[i] = a;
    primaryWork += a;
    if (a <= d) { hedged[i] = a; continue; }
    fired++;
    const done = Math.min(a, d + draw(rand));
    hedged[i] = done;
    backupWork += done - d; // the backup is cancelled once either reply lands
  }
  return {
    delay: d,
    plain: summarize(plain),
    hedged: summarize(hedged),
    extraRequests: fired / requests,
    extraWork: backupWork / primaryWork,
    samples: { plain, hedged },
  };
}

// Closed form for the hedged tail with independent replicas:
// P(T > t) = P(A > t) for t <= d, and P(A > t) * P(B > t - d) after it,
// because a hedged request is late only if both copies are.
export function hedgedSurvival(survival, d) {
  return (t) => (t <= d ? survival(t) : survival(t) * survival(t - d));
}
