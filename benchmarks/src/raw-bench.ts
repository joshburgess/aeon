/**
 * Raw benchmark: bypasses vitest's benchmarking framework to get
 * clean, isolated V8 JIT measurements with proper warmup.
 */

import { drain, filter, fromArray, map, reduce, scan } from "aeon-core"
import { VirtualScheduler } from "aeon-scheduler"

import { filter as mostFilter, map as mostMap, scan as mostScan, runEffects } from "@most/core"
import { newStream } from "@most/core"
import { newDefaultScheduler } from "@most/scheduler"
import type { Stream } from "@most/types"

const N = 1_000_000
const arr = Array.from({ length: N }, (_, i) => i)
const add = (a: number, b: number): number => a + b
const double = (x: number): number => x * 2
const isEven = (x: number): boolean => x % 2 === 0

const mostFromArray = <A>(values: readonly A[]): Stream<A> =>
  newStream((sink, scheduler) => {
    const t = scheduler.currentTime()
    for (let i = 0; i < values.length; i++) {
      sink.event(t, values[i]!)
    }
    sink.end(t)
    return { dispose() {} }
  })

async function benchmarkAeon(iterations: number): Promise<number[]> {
  const times: number[] = []
  for (let i = 0; i < iterations; i++) {
    const s = new VirtualScheduler()
    const start = performance.now()
    await reduce(add, 0, map(double, filter(isEven, fromArray(arr))), s)
    times.push(performance.now() - start)
  }
  return times
}

async function benchmarkMost(iterations: number): Promise<number[]> {
  const times: number[] = []
  for (let i = 0; i < iterations; i++) {
    const s = newDefaultScheduler()
    const start = performance.now()
    await runEffects(mostScan(add, 0, mostMap(double, mostFilter(isEven, mostFromArray(arr)))), s)
    times.push(performance.now() - start)
  }
  return times
}

function stats(times: number[]) {
  const sorted = [...times].sort((a, b) => a - b)
  const sum = sorted.reduce((a, b) => a + b, 0)
  const mean = sum / sorted.length
  const min = sorted[0]!
  const max = sorted[sorted.length - 1]!
  const p50 = sorted[Math.floor(sorted.length * 0.5)]!
  const p95 = sorted[Math.floor(sorted.length * 0.95)]!
  const p99 = sorted[Math.floor(sorted.length * 0.99)]!
  return { mean, min, max, p50, p95, p99 }
}

async function benchmarkAeonScan(iterations: number): Promise<number[]> {
  const times: number[] = []
  for (let i = 0; i < iterations; i++) {
    const s = new VirtualScheduler()
    const start = performance.now()
    await drain(scan(add, 0, fromArray(arr)), s)
    times.push(performance.now() - start)
  }
  return times
}

async function benchmarkMostScan(iterations: number): Promise<number[]> {
  const times: number[] = []
  for (let i = 0; i < iterations; i++) {
    const s = newDefaultScheduler()
    const start = performance.now()
    await runEffects(mostScan(add, 0, mostFromArray(arr)), s)
    times.push(performance.now() - start)
  }
  return times
}

async function main() {
  const WARMUP = 50
  const ITERATIONS = 200

  console.log(`filter → map → reduce (${N.toLocaleString()} integers)`)
  console.log(`Warmup: ${WARMUP} iterations, Measure: ${ITERATIONS} iterations\n`)

  // Warmup aeon (isolated — no JIT interference from @most)
  console.log("Warming up aeon...")
  await benchmarkAeon(WARMUP)

  // Measure aeon
  console.log("Measuring aeon...")
  const aeonTimes = await benchmarkAeon(ITERATIONS)
  const aeonStats = stats(aeonTimes)

  // Warmup @most (after aeon is done — separate JIT context for methods)
  console.log("Warming up @most...")
  await benchmarkMost(WARMUP)

  // Measure @most
  console.log("Measuring @most...")
  const mostTimes = await benchmarkMost(ITERATIONS)
  const mostStats = stats(mostTimes)

  console.log("\n--- Results ---")
  console.log(
    `aeon:      mean=${aeonStats.mean.toFixed(3)}ms  min=${aeonStats.min.toFixed(3)}ms  p50=${aeonStats.p50.toFixed(3)}ms  p95=${aeonStats.p95.toFixed(3)}ms  p99=${aeonStats.p99.toFixed(3)}ms`,
  )
  console.log(
    `@most/core: mean=${mostStats.mean.toFixed(3)}ms  min=${mostStats.min.toFixed(3)}ms  p50=${mostStats.p50.toFixed(3)}ms  p95=${mostStats.p95.toFixed(3)}ms  p99=${mostStats.p99.toFixed(3)}ms`,
  )
  console.log(`\nRatio (mean): @most is ${(aeonStats.mean / mostStats.mean).toFixed(2)}x faster`)
  console.log(`Ratio (p50):  @most is ${(aeonStats.p50 / mostStats.p50).toFixed(2)}x faster`)
  console.log(`Ratio (min):  @most is ${(aeonStats.min / mostStats.min).toFixed(2)}x faster`)

  // Also run in reverse order to check for ordering effects
  console.log("\n--- Reverse order (measure @most first, then aeon) ---")
  await benchmarkMost(WARMUP)
  const mostTimes2 = await benchmarkMost(ITERATIONS)
  const mostStats2 = stats(mostTimes2)

  await benchmarkAeon(WARMUP)
  const aeonTimes2 = await benchmarkAeon(ITERATIONS)
  const aeonStats2 = stats(aeonTimes2)

  console.log(
    `aeon:      mean=${aeonStats2.mean.toFixed(3)}ms  min=${aeonStats2.min.toFixed(3)}ms  p50=${aeonStats2.p50.toFixed(3)}ms  p95=${aeonStats2.p95.toFixed(3)}ms`,
  )
  console.log(
    `@most/core: mean=${mostStats2.mean.toFixed(3)}ms  min=${mostStats2.min.toFixed(3)}ms  p50=${mostStats2.p50.toFixed(3)}ms  p95=${mostStats2.p95.toFixed(3)}ms`,
  )
  console.log(`Ratio (mean): @most is ${(aeonStats2.mean / mostStats2.mean).toFixed(2)}x faster`)
  console.log(`Ratio (p50):  @most is ${(aeonStats2.p50 / mostStats2.p50).toFixed(2)}x faster`)
  console.log(`Ratio (min):  @most is ${(aeonStats2.min / mostStats2.min).toFixed(2)}x faster`)

  // --- Scan benchmark ---
  console.log("\n\n=== scan (1M integers) ===")
  console.log("Warming up aeon scan...")
  await benchmarkAeonScan(WARMUP)
  console.log("Measuring aeon scan...")
  const aeonScanTimes = await benchmarkAeonScan(ITERATIONS)
  const aeonScanStats = stats(aeonScanTimes)

  console.log("Warming up @most scan...")
  await benchmarkMostScan(WARMUP)
  console.log("Measuring @most scan...")
  const mostScanTimes = await benchmarkMostScan(ITERATIONS)
  const mostScanStats = stats(mostScanTimes)

  console.log("\n--- Scan Results ---")
  console.log(
    `aeon:      mean=${aeonScanStats.mean.toFixed(3)}ms  min=${aeonScanStats.min.toFixed(3)}ms  p50=${aeonScanStats.p50.toFixed(3)}ms  p95=${aeonScanStats.p95.toFixed(3)}ms`,
  )
  console.log(
    `@most/core: mean=${mostScanStats.mean.toFixed(3)}ms  min=${mostScanStats.min.toFixed(3)}ms  p50=${mostScanStats.p50.toFixed(3)}ms  p95=${mostScanStats.p95.toFixed(3)}ms`,
  )
  console.log(
    `Ratio (mean): @most is ${(aeonScanStats.mean / mostScanStats.mean).toFixed(2)}x faster`,
  )
  console.log(
    `Ratio (p50):  @most is ${(aeonScanStats.p50 / mostScanStats.p50).toFixed(2)}x faster`,
  )
  console.log(
    `Ratio (min):  @most is ${(aeonScanStats.min / mostScanStats.min).toFixed(2)}x faster`,
  )
}

main().catch(console.error)
