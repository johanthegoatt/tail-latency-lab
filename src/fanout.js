import { rng, latencyModel, summarize } from "./dist.js";

// If one server is slow with probability p, a request that waits on n servers
// in parallel is slow unless all n are fast: 1 - (1 - p)^n. With p = 1% and
// n = 100 that is 63%, the figure in Dean and Barroso, The Tail at Scale.
export const slowShare = (p, n) => 1 - (1 - p) ** n;

// Fan-out needed before at least `target` of requests hit a slow server.
export const fanoutFor = (p, target) => Math.ceil(Math.log(1 - target) / Math.log(1 - p));

// A request fans out to `fanout` leaves and finishes when the slowest one does.
export function simulateFanout({ fanout = 100, requests = 5000, seed = 1, threshold = 100, ...model } = {}) {
  const rand = rng(seed), draw = latencyModel(model);
  const leaf = [], whole = [];
  let over = 0, leafOver = 0;
  for (let r = 0; r < requests; r++) {
    let worst = 0;
    for (let i = 0; i < fanout; i++) {
      const t = draw(rand);
      if (t > threshold) leafOver++;
      if (i === 0) leaf.push(t);
      if (t > worst) worst = t;
    }
    if (worst > threshold) over++;
    whole.push(worst);
  }
  const p = leafOver / (requests * fanout);
  return {
    leaf: summarize(leaf),
    request: summarize(whole),
    leafSlow: p,
    requestSlow: over / requests,
    predicted: slowShare(p, fanout),
  };
}
