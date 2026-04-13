/**
 * Isolate the performance gap between pulse and @most/core.
 * Tests specific hypotheses about what causes the 1.3-1.6x gap.
 */

import { bench, describe } from "vitest"

import { drain, filter, fromArray, map, reduce } from "aeon-core"
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

// Hypothesis 1: VirtualScheduler construction overhead
// Pre-create scheduler outside the benchmark loop
describe("H1: scheduler reuse vs creation", () => {
  const reusedScheduler = new VirtualScheduler()

  bench("pulse (new scheduler each time)", async () => {
    const s = new VirtualScheduler()
    await reduce(add, 0, map(double, filter(isEven, fromArray(arr))), s)
  })

  bench("pulse (reused scheduler)", async () => {
    await reduce(add, 0, map(double, filter(isEven, fromArray(arr))), reusedScheduler)
  })

  bench("@most/core (new scheduler each time)", async () => {
    const s = newDefaultScheduler()
    await runEffects(mostScan(add, 0, mostMap(double, mostFilter(isEven, mostFromArray(arr)))), s)
  })
})

// Hypothesis 2: Promise overhead
// Test synchronous reduce without promise wrapping
describe("H2: promise vs sync", () => {
  bench("pulse filter-map-reduce (promise)", async () => {
    const s = new VirtualScheduler()
    await reduce(add, 0, map(double, filter(isEven, fromArray(arr))), s)
  })

  bench("manual sync loop (same pattern)", () => {
    let acc = 0
    for (let i = 0; i < N; i++) {
      if (isEven(i)) {
        acc = add(acc, double(i))
      }
    }
    return acc
  })
})

// Hypothesis 3: Sink object allocation per benchmark iteration
// Both create FilterMapSink + ReduceSink per iteration.
// Test if allocation frequency matters.
describe("H3: drain(fromArray) — raw loop overhead", () => {
  bench("pulse drain(fromArray)", async () => {
    const s = new VirtualScheduler()
    await drain(fromArray(arr), s)
  })

  bench("@most drain(fromArray)", async () => {
    const s = newDefaultScheduler()
    await runEffects(mostFromArray(arr), s)
  })

  bench("pulse drain(fromArray) reused scheduler", async () => {
    const reused = new VirtualScheduler()
    await drain(fromArray(arr), reused)
  })
})
