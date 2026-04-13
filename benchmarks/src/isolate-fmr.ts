import { filter as mFilter, map as mMap, scan as mScan, newStream, runEffects } from "@most/core"
import { newDefaultScheduler } from "@most/scheduler"
import type { Stream } from "@most/types"
/**
 * Diagnostic: isolate the filter-map-reduce gap.
 */
import { drain, filter, fromArray, map, reduce, scan } from "aeon-core"
import { VirtualScheduler } from "aeon-scheduler"

const N = 1_000_000
const arr = Array.from({ length: N }, (_, i) => i)
const add = (a: number, b: number): number => a + b
const double = (x: number): number => x * 2
const isEven = (x: number): boolean => x % 2 === 0

const mostFromArray = <A>(vals: readonly A[]): Stream<A> =>
  newStream((sink, sched) => {
    const t = sched.currentTime()
    for (let i = 0; i < vals.length; i++) sink.event(t, vals[i]!)
    sink.end(t)
    return { dispose() {} }
  })

const ITER = 200
const WARMUP = 50

function stats(times: number[]) {
  const sum = times.reduce((a, b) => a + b, 0)
  return sum / times.length
}

async function main() {
  // Test 1: Scheduler creation overhead
  {
    const SCHED_ITER = 10000
    let s: any
    const t0 = performance.now()
    for (let i = 0; i < SCHED_ITER; i++) s = new VirtualScheduler()
    const aeonTime = performance.now() - t0

    const t1 = performance.now()
    for (let i = 0; i < SCHED_ITER; i++) s = newDefaultScheduler()
    const mostTime = performance.now() - t1

    console.log(`Scheduler creation (${SCHED_ITER}x):`)
    console.log(
      `  VirtualScheduler:    ${aeonTime.toFixed(1)}ms  (${((aeonTime / SCHED_ITER) * 1000).toFixed(1)}µs each)`,
    )
    console.log(
      `  newDefaultScheduler: ${mostTime.toFixed(1)}ms  (${((mostTime / SCHED_ITER) * 1000).toFixed(1)}µs each)`,
    )
    console.log()
  }

  // Test 2: Shared scheduler — isolate construction+hot-path from scheduler creation
  {
    const vs = new VirtualScheduler()
    for (let i = 0; i < WARMUP; i++)
      await reduce(add, 0, map(double, filter(isEven, fromArray(arr))), vs)
    const pt: number[] = []
    for (let i = 0; i < ITER; i++) {
      const s = performance.now()
      await reduce(add, 0, map(double, filter(isEven, fromArray(arr))), vs)
      pt.push(performance.now() - s)
    }

    const ms = newDefaultScheduler()
    for (let i = 0; i < WARMUP; i++)
      await runEffects(mScan(add, 0, mMap(double, mFilter(isEven, mostFromArray(arr)))), ms)
    const mt: number[] = []
    for (let i = 0; i < ITER; i++) {
      const s = performance.now()
      await runEffects(mScan(add, 0, mMap(double, mFilter(isEven, mostFromArray(arr)))), ms)
      mt.push(performance.now() - s)
    }

    const pm = stats(pt)
    const mm = stats(mt)
    const ratio = pm / mm
    console.log("Shared scheduler (reduce vs scan+runEffects):")
    console.log(`  aeon: ${pm.toFixed(3)}ms  @most: ${mm.toFixed(3)}ms`)
    console.log(
      `  → ${ratio > 1 ? `@most ${ratio.toFixed(2)}x faster` : `aeon ${(1 / ratio).toFixed(2)}x faster`}`,
    )
    console.log()
  }

  // Test 3: Apples-to-apples — both use scan+drain/runEffects (same # of sinks)
  {
    const vs = new VirtualScheduler()
    for (let i = 0; i < WARMUP; i++)
      await drain(scan(add, 0, map(double, filter(isEven, fromArray(arr)))), vs)
    const pt: number[] = []
    for (let i = 0; i < ITER; i++) {
      const s = performance.now()
      await drain(scan(add, 0, map(double, filter(isEven, fromArray(arr)))), vs)
      pt.push(performance.now() - s)
    }

    const ms = newDefaultScheduler()
    for (let i = 0; i < WARMUP; i++)
      await runEffects(mScan(add, 0, mMap(double, mFilter(isEven, mostFromArray(arr)))), ms)
    const mt: number[] = []
    for (let i = 0; i < ITER; i++) {
      const s = performance.now()
      await runEffects(mScan(add, 0, mMap(double, mFilter(isEven, mostFromArray(arr)))), ms)
      mt.push(performance.now() - s)
    }

    const pm = stats(pt)
    const mm = stats(mt)
    const ratio = pm / mm
    console.log("Apples-to-apples scan+drain (shared scheduler):")
    console.log(`  aeon: ${pm.toFixed(3)}ms  @most: ${mm.toFixed(3)}ms`)
    console.log(
      `  → ${ratio > 1 ? `@most ${ratio.toFixed(2)}x faster` : `aeon ${(1 / ratio).toFixed(2)}x faster`}`,
    )
    console.log()
  }

  // Test 4: New scheduler each time — but apples-to-apples (scan+drain)
  {
    for (let i = 0; i < WARMUP; i++)
      await drain(scan(add, 0, map(double, filter(isEven, fromArray(arr)))), new VirtualScheduler())
    const pt: number[] = []
    for (let i = 0; i < ITER; i++) {
      const s = performance.now()
      await drain(scan(add, 0, map(double, filter(isEven, fromArray(arr)))), new VirtualScheduler())
      pt.push(performance.now() - s)
    }

    for (let i = 0; i < WARMUP; i++)
      await runEffects(
        mScan(add, 0, mMap(double, mFilter(isEven, mostFromArray(arr)))),
        newDefaultScheduler(),
      )
    const mt: number[] = []
    for (let i = 0; i < ITER; i++) {
      const s = performance.now()
      await runEffects(
        mScan(add, 0, mMap(double, mFilter(isEven, mostFromArray(arr)))),
        newDefaultScheduler(),
      )
      mt.push(performance.now() - s)
    }

    const pm = stats(pt)
    const mm = stats(mt)
    const ratio = pm / mm
    console.log("New scheduler each time, scan+drain:")
    console.log(`  aeon: ${pm.toFixed(3)}ms  @most: ${mm.toFixed(3)}ms`)
    console.log(
      `  → ${ratio > 1 ? `@most ${ratio.toFixed(2)}x faster` : `aeon ${(1 / ratio).toFixed(2)}x faster`}`,
    )
  }
}

main().catch(console.error)
