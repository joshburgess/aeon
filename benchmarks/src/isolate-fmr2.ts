/**
 * Diagnostic: reversed run order + alternating to eliminate ordering bias.
 */
import { fromArray, filter, map, reduce, drain, scan } from "@pulse/core";
import { VirtualScheduler } from "@pulse/scheduler";
import { map as mMap, filter as mFilter, scan as mScan, runEffects, newStream } from "@most/core";
import { newDefaultScheduler } from "@most/scheduler";
import type { Stream } from "@most/types";

const N = 1_000_000;
const arr = Array.from({ length: N }, (_, i) => i);
const add = (a: number, b: number): number => a + b;
const double = (x: number): number => x * 2;
const isEven = (x: number): boolean => x % 2 === 0;

const mostFromArray = <A>(vals: readonly A[]): Stream<A> =>
  newStream((sink, sched) => {
    const t = sched.currentTime();
    for (let i = 0; i < vals.length; i++) sink.event(t, vals[i]!);
    sink.end(t);
    return { dispose() {} };
  });

async function main() {
  const ITER = 200;
  const WARMUP = 50;
  const vs = new VirtualScheduler();
  const ms = newDefaultScheduler();

  // Warmup BOTH first
  for (let i = 0; i < WARMUP; i++) {
    await reduce(add, 0, map(double, filter(isEven, fromArray(arr))), vs);
    await runEffects(mScan(add, 0, mMap(double, mFilter(isEven, mostFromArray(arr)))), ms);
  }

  // Alternating measurement to eliminate ordering effects
  const pt: number[] = [];
  const mt: number[] = [];
  for (let i = 0; i < ITER; i++) {
    const s1 = performance.now();
    await reduce(add, 0, map(double, filter(isEven, fromArray(arr))), vs);
    pt.push(performance.now() - s1);

    const s2 = performance.now();
    await runEffects(mScan(add, 0, mMap(double, mFilter(isEven, mostFromArray(arr)))), ms);
    mt.push(performance.now() - s2);
  }

  const pmean = pt.reduce((a, b) => a + b) / pt.length;
  const mmean = mt.reduce((a, b) => a + b) / mt.length;
  const ratio = pmean / mmean;
  console.log(`Alternating, shared scheduler (reduce vs scan+runEffects):`);
  console.log(`  pulse: ${pmean.toFixed(3)}ms  @most: ${mmean.toFixed(3)}ms`);
  console.log(`  → ${ratio > 1 ? `@most ${ratio.toFixed(2)}x faster` : `pulse ${(1 / ratio).toFixed(2)}x faster`}`);
  console.log();

  // Now test JUST the reduce path — no filter/map, pure accumulation
  // This isolates whether the issue is FilterMapSink or ReduceSink
  for (let i = 0; i < WARMUP; i++) {
    await reduce(add, 0, fromArray(arr), vs);
    await runEffects(mScan(add, 0, mostFromArray(arr)), ms);
  }

  const pt2: number[] = [];
  const mt2: number[] = [];
  for (let i = 0; i < ITER; i++) {
    const s1 = performance.now();
    await reduce(add, 0, fromArray(arr), vs);
    pt2.push(performance.now() - s1);

    const s2 = performance.now();
    await runEffects(mScan(add, 0, mostFromArray(arr)), ms);
    mt2.push(performance.now() - s2);
  }

  const pmean2 = pt2.reduce((a, b) => a + b) / pt2.length;
  const mmean2 = mt2.reduce((a, b) => a + b) / mt2.length;
  const ratio2 = pmean2 / mmean2;
  console.log(`Alternating, shared scheduler, REDUCE ONLY (no filter/map):`);
  console.log(`  pulse: ${pmean2.toFixed(3)}ms  @most: ${mmean2.toFixed(3)}ms`);
  console.log(`  → ${ratio2 > 1 ? `@most ${ratio2.toFixed(2)}x faster` : `pulse ${(1 / ratio2).toFixed(2)}x faster`}`);
  console.log();

  // Now test the POLYMORPHIC theory — both libraries run in the same V8 context.
  // The sink.event() callsite in FilterMapSink now sees TWO different receiver types
  // (ReduceSink for pulse, ScanSink for @most) which could deoptimize.
  // Test pulse ALONE in isolation:
  const pt3: number[] = [];
  for (let i = 0; i < ITER; i++) {
    const s1 = performance.now();
    await reduce(add, 0, map(double, filter(isEven, fromArray(arr))), vs);
    pt3.push(performance.now() - s1);
  }
  const pmean3 = pt3.reduce((a, b) => a + b) / pt3.length;
  console.log(`Pulse ALONE after all warmup (no @most interleaving):`);
  console.log(`  pulse: ${pmean3.toFixed(3)}ms`);
  console.log();

  // @most ALONE
  const mt3: number[] = [];
  for (let i = 0; i < ITER; i++) {
    const s2 = performance.now();
    await runEffects(mScan(add, 0, mMap(double, mFilter(isEven, mostFromArray(arr)))), ms);
    mt3.push(performance.now() - s2);
  }
  const mmean3 = mt3.reduce((a, b) => a + b) / mt3.length;
  console.log(`@most ALONE after all warmup (no pulse interleaving):`);
  console.log(`  @most: ${mmean3.toFixed(3)}ms`);
  console.log(`  → ${pmean3 / mmean3 > 1 ? `@most ${(pmean3 / mmean3).toFixed(2)}x` : `pulse ${(mmean3 / pmean3).toFixed(2)}x`}`);
}

main().catch(console.error);
