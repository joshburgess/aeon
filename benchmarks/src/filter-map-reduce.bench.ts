/**
 * Benchmark: filter → map → reduce over 1M integers.
 *
 * The canonical stream library benchmark. Tests the hot path of
 * synchronous event propagation through a typical pipeline.
 */

import { bench, describe } from "vitest"

// --- Aeon ---
import { drain, filter, fromArray, map, reduce, scan } from "aeon-core"
import { VirtualScheduler } from "aeon-scheduler"

// --- @most/core ---
import { filter as mostFilter, map as mostMap, scan as mostScan, runEffects } from "@most/core"
import { newDefaultScheduler } from "@most/scheduler"

// --- RxJS ---
import {
  lastValueFrom,
  filter as rxFilter,
  from as rxFrom,
  map as rxMap,
  reduce as rxReduce,
} from "rxjs"

// --- Helpers ---
import { add, double, isEven, range } from "./helpers.js"

const N = 1_000_000
const arr = range(N)

describe("filter → map → reduce (1M integers)", () => {
  bench("aeon", async () => {
    const scheduler = new VirtualScheduler()
    await reduce(add, 0, map(double, filter(isEven, fromArray(arr))), scheduler)
  })

  bench("@most/core", async () => {
    const scheduler = newDefaultScheduler()
    await runEffects(
      mostScan(add, 0, mostMap(double, mostFilter(isEven, mostFromArray(arr)))),
      scheduler,
    )
  })

  bench("rxjs", async () => {
    await lastValueFrom(rxFrom(arr).pipe(rxFilter(isEven), rxMap(double), rxReduce(add, 0)))
  })

  bench("native array", () => {
    arr.filter(isEven).map(double).reduce(add, 0)
  })
})

import { newStream } from "@most/core"
// --- @most/core fromArray helper (inline to avoid import issues) ---
import type { Stream } from "@most/types"

const mostFromArray = <A>(values: readonly A[]): Stream<A> =>
  newStream((sink, scheduler) => {
    const t = scheduler.currentTime()
    for (let i = 0; i < values.length; i++) {
      sink.event(t, values[i]!)
    }
    sink.end(t)
    return { dispose() {} }
  })
