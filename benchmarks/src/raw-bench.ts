/**
 * Raw benchmark: bypasses vitest's benchmarking framework to get
 * clean, isolated V8 JIT measurements with proper warmup.
 */

import { fromArray, filter, map, reduce, drain, scan } from "@pulse/core";
import { VirtualScheduler } from "@pulse/scheduler";

import {
  map as mostMap,
  filter as mostFilter,
  scan as mostScan,
  runEffects,
} from "@most/core";
import { newDefaultScheduler } from "@most/scheduler";
import type { Stream } from "@most/types";
import { newStream } from "@most/core";

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

async function benchmarkPulse(iterations: number): Promise<number[]> {
  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const s = new VirtualScheduler();
    const start = performance.now();
    await reduce(add, 0, map(double, filter(isEven, fromArray(arr))), s);
    times.push(performance.now() - start);
  }
  return times;
}

async function benchmarkMost(iterations: number): Promise<number[]> {
  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const s = newDefaultScheduler();
    const start = performance.now();
    await runEffects(
      mostScan(add, 0, mostMap(double, mostFilter(isEven, mostFromArray(arr)))),
      s,
    );
    times.push(performance.now() - start);
  }
  return times;
}

function stats(times: number[]) {
  const sorted = [...times].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / sorted.length;
  const min = sorted[0]!;
  const max = sorted[sorted.length - 1]!;
  const p50 = sorted[Math.floor(sorted.length * 0.5)]!;
  const p95 = sorted[Math.floor(sorted.length * 0.95)]!;
  const p99 = sorted[Math.floor(sorted.length * 0.99)]!;
  return { mean, min, max, p50, p95, p99 };
}

async function benchmarkPulseScan(iterations: number): Promise<number[]> {
  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const s = new VirtualScheduler();
    const start = performance.now();
    await drain(scan(add, 0, fromArray(arr)), s);
    times.push(performance.now() - start);
  }
  return times;
}

async function benchmarkMostScan(iterations: number): Promise<number[]> {
  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const s = newDefaultScheduler();
    const start = performance.now();
    await runEffects(mostScan(add, 0, mostFromArray(arr)), s);
    times.push(performance.now() - start);
  }
  return times;
}

async function main() {
  const WARMUP = 50;
  const ITERATIONS = 200;

  console.log(`filter → map → reduce (${N.toLocaleString()} integers)`);
  console.log(`Warmup: ${WARMUP} iterations, Measure: ${ITERATIONS} iterations\n`);

  // Warmup pulse (isolated — no JIT interference from @most)
  console.log("Warming up pulse...");
  await benchmarkPulse(WARMUP);

  // Measure pulse
  console.log("Measuring pulse...");
  const pulseTimes = await benchmarkPulse(ITERATIONS);
  const pulseStats = stats(pulseTimes);

  // Warmup @most (after pulse is done — separate JIT context for methods)
  console.log("Warming up @most...");
  await benchmarkMost(WARMUP);

  // Measure @most
  console.log("Measuring @most...");
  const mostTimes = await benchmarkMost(ITERATIONS);
  const mostStats = stats(mostTimes);

  console.log("\n--- Results ---");
  console.log(
    `pulse:      mean=${pulseStats.mean.toFixed(3)}ms  min=${pulseStats.min.toFixed(3)}ms  p50=${pulseStats.p50.toFixed(3)}ms  p95=${pulseStats.p95.toFixed(3)}ms  p99=${pulseStats.p99.toFixed(3)}ms`,
  );
  console.log(
    `@most/core: mean=${mostStats.mean.toFixed(3)}ms  min=${mostStats.min.toFixed(3)}ms  p50=${mostStats.p50.toFixed(3)}ms  p95=${mostStats.p95.toFixed(3)}ms  p99=${mostStats.p99.toFixed(3)}ms`,
  );
  console.log(
    `\nRatio (mean): @most is ${(pulseStats.mean / mostStats.mean).toFixed(2)}x faster`,
  );
  console.log(
    `Ratio (p50):  @most is ${(pulseStats.p50 / mostStats.p50).toFixed(2)}x faster`,
  );
  console.log(
    `Ratio (min):  @most is ${(pulseStats.min / mostStats.min).toFixed(2)}x faster`,
  );

  // Also run in reverse order to check for ordering effects
  console.log("\n--- Reverse order (measure @most first, then pulse) ---");
  await benchmarkMost(WARMUP);
  const mostTimes2 = await benchmarkMost(ITERATIONS);
  const mostStats2 = stats(mostTimes2);

  await benchmarkPulse(WARMUP);
  const pulseTimes2 = await benchmarkPulse(ITERATIONS);
  const pulseStats2 = stats(pulseTimes2);

  console.log(
    `pulse:      mean=${pulseStats2.mean.toFixed(3)}ms  min=${pulseStats2.min.toFixed(3)}ms  p50=${pulseStats2.p50.toFixed(3)}ms  p95=${pulseStats2.p95.toFixed(3)}ms`,
  );
  console.log(
    `@most/core: mean=${mostStats2.mean.toFixed(3)}ms  min=${mostStats2.min.toFixed(3)}ms  p50=${mostStats2.p50.toFixed(3)}ms  p95=${mostStats2.p95.toFixed(3)}ms`,
  );
  console.log(
    `Ratio (mean): @most is ${(pulseStats2.mean / mostStats2.mean).toFixed(2)}x faster`,
  );
  console.log(
    `Ratio (p50):  @most is ${(pulseStats2.p50 / mostStats2.p50).toFixed(2)}x faster`,
  );
  console.log(
    `Ratio (min):  @most is ${(pulseStats2.min / mostStats2.min).toFixed(2)}x faster`,
  );

  // --- Scan benchmark ---
  console.log("\n\n=== scan (1M integers) ===");
  console.log("Warming up pulse scan...");
  await benchmarkPulseScan(WARMUP);
  console.log("Measuring pulse scan...");
  const pulseScanTimes = await benchmarkPulseScan(ITERATIONS);
  const pulseScanStats = stats(pulseScanTimes);

  console.log("Warming up @most scan...");
  await benchmarkMostScan(WARMUP);
  console.log("Measuring @most scan...");
  const mostScanTimes = await benchmarkMostScan(ITERATIONS);
  const mostScanStats = stats(mostScanTimes);

  console.log("\n--- Scan Results ---");
  console.log(
    `pulse:      mean=${pulseScanStats.mean.toFixed(3)}ms  min=${pulseScanStats.min.toFixed(3)}ms  p50=${pulseScanStats.p50.toFixed(3)}ms  p95=${pulseScanStats.p95.toFixed(3)}ms`,
  );
  console.log(
    `@most/core: mean=${mostScanStats.mean.toFixed(3)}ms  min=${mostScanStats.min.toFixed(3)}ms  p50=${mostScanStats.p50.toFixed(3)}ms  p95=${mostScanStats.p95.toFixed(3)}ms`,
  );
  console.log(
    `Ratio (mean): @most is ${(pulseScanStats.mean / mostScanStats.mean).toFixed(2)}x faster`,
  );
  console.log(
    `Ratio (p50):  @most is ${(pulseScanStats.p50 / mostScanStats.p50).toFixed(2)}x faster`,
  );
  console.log(
    `Ratio (min):  @most is ${(pulseScanStats.min / mostScanStats.min).toFixed(2)}x faster`,
  );
}

main().catch(console.error);
