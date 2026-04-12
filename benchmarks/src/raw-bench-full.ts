/**
 * Full raw benchmark suite: tests all major combinators with proper
 * warmup and isolation to avoid vitest JIT pollution.
 */

import { drain, drop, filter, fromArray, map, merge, reduce, scan, take } from "aeon-core";
import { VirtualScheduler } from "aeon-scheduler";

import {
  filter as mostFilter,
  map as mostMap,
  merge as mostMerge,
  scan as mostScan,
  skip as mostSkip,
  take as mostTake,
  runEffects,
} from "@most/core";
import { newStream } from "@most/core";
import { newDefaultScheduler } from "@most/scheduler";
import type { Stream } from "@most/types";

const N = 1_000_000;
const arr = Array.from({ length: N }, (_, i) => i);
const add = (a: number, b: number): number => a + b;
const double = (x: number): number => x * 2;
const isEven = (x: number): boolean => x % 2 === 0;

const mostFromArray = <A>(values: readonly A[]): Stream<A> =>
  newStream((sink, scheduler) => {
    const t = scheduler.currentTime();
    for (let i = 0; i < values.length; i++) {
      sink.event(t, values[i]!);
    }
    sink.end(t);
    return { dispose() {} };
  });

const WARMUP = 50;
const ITERATIONS = 200;

function stats(times: number[]) {
  const sorted = [...times].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / sorted.length;
  const min = sorted[0]!;
  const p50 = sorted[Math.floor(sorted.length * 0.5)]!;
  const p95 = sorted[Math.floor(sorted.length * 0.95)]!;
  return { mean, min, p50, p95 };
}

function report(
  name: string,
  pulseStats: ReturnType<typeof stats>,
  mostStats: ReturnType<typeof stats>,
) {
  const ratio = pulseStats.mean / mostStats.mean;
  const label =
    ratio > 1 ? `@most ${ratio.toFixed(2)}x faster` : `pulse ${(1 / ratio).toFixed(2)}x faster`;
  console.log(`  ${name}`);
  console.log(
    `    pulse:  mean=${pulseStats.mean.toFixed(3)}ms  min=${pulseStats.min.toFixed(3)}ms  p50=${pulseStats.p50.toFixed(3)}ms`,
  );
  console.log(
    `    @most:  mean=${mostStats.mean.toFixed(3)}ms  min=${mostStats.min.toFixed(3)}ms  p50=${mostStats.p50.toFixed(3)}ms`,
  );
  console.log(`    → ${label}`);
  console.log();
}

async function bench(fn: () => Promise<unknown>, iterations: number): Promise<number[]> {
  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    times.push(performance.now() - start);
  }
  return times;
}

async function runBench(
  name: string,
  pulseFn: () => Promise<unknown>,
  mostFn: () => Promise<unknown>,
) {
  // Warmup both
  await bench(pulseFn, WARMUP);
  await bench(mostFn, WARMUP);

  // Alternating measurement to eliminate run-order bias
  const pulseTimes: number[] = [];
  const mostTimes: number[] = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const s1 = performance.now();
    await pulseFn();
    pulseTimes.push(performance.now() - s1);

    const s2 = performance.now();
    await mostFn();
    mostTimes.push(performance.now() - s2);
  }

  report(name, stats(pulseTimes), stats(mostTimes));
}

async function main() {
  console.log(`Raw benchmark suite (${N.toLocaleString()} integers)`);
  console.log(`Warmup: ${WARMUP}, Measure: ${ITERATIONS}\n`);

  // 1. drain(fromArray)
  await runBench(
    "drain(fromArray)",
    async () => {
      await drain(fromArray(arr), new VirtualScheduler());
    },
    async () => {
      await runEffects(mostFromArray(arr), newDefaultScheduler());
    },
  );

  // 2. map (drain(map(double, fromArray)))
  await runBench(
    "map",
    async () => {
      await drain(map(double, fromArray(arr)), new VirtualScheduler());
    },
    async () => {
      await runEffects(mostMap(double, mostFromArray(arr)), newDefaultScheduler());
    },
  );

  // 3. filter
  await runBench(
    "filter",
    async () => {
      await drain(filter(isEven, fromArray(arr)), new VirtualScheduler());
    },
    async () => {
      await runEffects(mostFilter(isEven, mostFromArray(arr)), newDefaultScheduler());
    },
  );

  // 4. filter → map → scan (3 sinks each — fair comparison)
  await runBench(
    "filter → map → scan",
    async () => {
      await drain(
        scan(add, 0, map(double, filter(isEven, fromArray(arr)))),
        new VirtualScheduler(),
      );
    },
    async () => {
      await runEffects(
        mostScan(add, 0, mostMap(double, mostFilter(isEven, mostFromArray(arr)))),
        newDefaultScheduler(),
      );
    },
  );

  // 5. filter → map → reduce (pulse-only advantage — @most has no reduce)
  await runBench(
    "filter → map → reduce",
    async () => {
      await reduce(add, 0, map(double, filter(isEven, fromArray(arr))), new VirtualScheduler());
    },
    async () => {
      await runEffects(
        mostScan(add, 0, mostMap(double, mostFilter(isEven, mostFromArray(arr)))),
        newDefaultScheduler(),
      );
    },
  );

  // 6. scan
  await runBench(
    "scan",
    async () => {
      await drain(scan(add, 0, fromArray(arr)), new VirtualScheduler());
    },
    async () => {
      await runEffects(mostScan(add, 0, mostFromArray(arr)), newDefaultScheduler());
    },
  );

  // 6. take(100) from 1M
  await runBench(
    "take(100)",
    async () => {
      await drain(take(100, fromArray(arr)), new VirtualScheduler());
    },
    async () => {
      await runEffects(mostTake(100, mostFromArray(arr)), newDefaultScheduler());
    },
  );

  // 7. drop(999_900) from 1M
  await runBench(
    "drop(999900)",
    async () => {
      await drain(drop(999_900, fromArray(arr)), new VirtualScheduler());
    },
    async () => {
      await runEffects(mostSkip(999_900, mostFromArray(arr)), newDefaultScheduler());
    },
  );

  // 8. reduce only (no map/filter)
  await runBench(
    "reduce",
    async () => {
      await reduce(add, 0, fromArray(arr), new VirtualScheduler());
    },
    async () => {
      await runEffects(mostScan(add, 0, mostFromArray(arr)), newDefaultScheduler());
    },
  );

  // 9. merge(2 streams) — @most's merge crashes on synchronous sources, so pulse-only
  {
    const half = arr.slice(0, 500_000);
    await bench(
      async () => drain(merge(fromArray(half), fromArray(half)), new VirtualScheduler()),
      WARMUP,
    );
    const pulseTimes = await bench(
      async () => drain(merge(fromArray(half), fromArray(half)), new VirtualScheduler()),
      ITERATIONS,
    );
    const ps = stats(pulseTimes);
    console.log("  merge(2 × 500K)");
    console.log(
      `    pulse:  mean=${ps.mean.toFixed(3)}ms  min=${ps.min.toFixed(3)}ms  p50=${ps.p50.toFixed(3)}ms`,
    );
    console.log("    (@most crashes on synchronous merge — skipped)");
    console.log();
  }
}

main().catch(console.error);
