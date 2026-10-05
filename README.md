# tail-latency-lab

A page that waits on 100 backends in parallel is only as fast as the slowest one. If each backend has a 1% chance of a one-second hiccup, 63% of page loads hit at least one. This repo simulates that effect and three fixes from the literature, with no dependencies, and checks each simulation against its closed form.

Live: https://tail-latency-lab.johanthegoat.xyz

## Results

Service times are lognormal around 10 ms (sigma 0.35) with a 1% slow mode around 1 s. All runs are seeded; `node --test` checks the shape of every table below.

**Fan-out.** A request over n leaves is slow with probability `1 - (1 - p)^n`. At p = 1% that is 9.6% for 10 leaves, 50% at 69 leaves and 63.4% at 100. At fan-out 100 the request median (about 840 ms) sits above the leaf p99.

**Hedged requests, idle replicas.** The backup goes out once the primary passes the p95. Seeds 1 to 5, 20,000 requests each:

| | p99 | p99.9 | Extra requests | Extra work |
| --- | ---: | ---: | ---: | ---: |
| No hedge | 218 ms | 1,555 ms | | |
| Hedge at p95 (about 19 ms) | 26 ms | 34 ms | 4.7% | 1.5% |

Extra work is lower than extra requests because the losing backup is cancelled once either copy answers.

**Hedged requests, loaded replicas.** 10 FIFO replicas, Poisson arrivals, and a hiccup blocks the queue behind it. Seeds 1 to 5, 200,000 requests each:

| Load | Policy | p50 | p99 | p99.9 | Extra work |
| ---: | --- | ---: | ---: | ---: | ---: |
| 20% | none | 11 ms | 1,485 ms | 2,518 ms | |
| 20% | hedge at p95 | 11 ms | 771 ms | 1,320 ms | 3% |
| 20% | duplicate all | 9 ms | 326 ms | 1,021 ms | 39% |
| 60% | none | 21 ms | 3,585 ms | 5,488 ms | |
| 60% | hedge at p95 | 22 ms | 2,623 ms | 3,615 ms | 3% |
| 60% | hedge at p50 | 39 ms | 2,103 ms | 3,186 ms | 35% |
| 70% | none | 210 ms | 4,749 ms | 6,848 ms | |
| 70% | hedge at p95 | 257 ms | 3,799 ms | 5,261 ms | 3% |
| 70% | duplicate all | 5,483 ms | 11,240 ms | 12,677 ms | 44% |

The p95 hedge costs about 3% of capacity at every load and cuts the tail at every load. Duplicating every request is the best policy at 20% load and pushes the system past saturation at 70%, where the median grows 26x.

**Power of two choices.** 100 servers, arrival rate 0.9 per server, exponential service of mean 1. Seeds 1 to 5, 200,000 jobs each:

| Policy | Mean time | Theory | p99 | Max queue |
| --- | ---: | ---: | ---: | ---: |
| Random | 10.00 | 10.00 | 45.5 | 75 |
| Round robin | 5.1 | | 23.6 | |
| Best of 2 | 2.63 | 2.61 | 8.9 | 6 |
| Best of 3 | 2.07 | 2.03 | 7.5 | 4 |
| Shortest of all 100 | 1.07 | | 4.9 | 1 |

The second sample cuts mean time almost 4x; the third saves another 0.56.

## How each one works

- **Fan-out** (`src/fanout.js`): each request draws n leaf latencies and takes the max. `slowShare(p, n)` is the closed form and `fanoutFor(p, target)` inverts it. From Dean and Barroso, *The Tail at Scale*, CACM 56(2), 2013.
- **Hedged requests** (`src/hedge.js`): the delay is calibrated on a separate seed so it is not tuned on the samples it is scored on. A test checks the simulated tail against `P(A > t) * P(B > t - d)`, since a hedged request is late only when both copies are.
- **Loaded hedging** (`src/loaded.js`): replicas keep a free-at time; hedge checks come due in arrival order, so a FIFO replaces a priority queue. A backup that starts before the primary answers holds its replica until then; one still queued is dropped. A primary that loses runs to completion, so extra work is an upper bound.
- **Two choices** (`src/balance.js`): the supermarket model from Mitzenmacher, *The Power of Two Choices in Randomized Load Balancing*, IEEE TPDS 2001. The theory column is `T_d = sum over i >= 1 of lambda^((d^i - d) / (d - 1))`, from the fixed point where the share of servers with at least i jobs is `lambda^((d^i - 1) / (d - 1))`. For d = 1 it reduces to the M/M/1 result `1 / (1 - lambda)`.

## Use

```js
import { slowShare } from "./src/fanout.js";
import { simulateHedge } from "./src/hedge.js";
import { simulateLoaded } from "./src/loaded.js";
import { simulateBalance } from "./src/balance.js";

slowShare(0.01, 100);                         // 0.634
simulateHedge({ delayQ: 0.95 });              // { plain, hedged, extraRequests, extraWork }
simulateLoaded({ load: 0.6, delay: 0 });      // duplicate everything at 60% load
simulateBalance({ lambda: 0.9, policy: "two" });
```

## Layout

```
src/dist.js      mulberry32, normal and exponential draws, service-time model, percentiles
src/fanout.js    fan-out tail amplification
src/hedge.js     hedged requests on independent replicas
src/loaded.js    hedging on loaded FIFO replicas
src/balance.js   supermarket model: random, round robin, best of d, shortest queue
index.html       the lab page; open it through any static server
test/            node --test
```

```
npm test
```

## License

MIT
