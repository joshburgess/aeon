/**
 * Benchmark: take + drop (slice) over 1M integers.
 *
 * Tests early termination and drop overhead.
 */

import { bench, describe } from "vitest"

// --- Aeon ---
import { drain, drop, fromArray, take } from "aeon-core"
import { VirtualScheduler } from "aeon-scheduler"

// --- @most/core ---
import { skip as mostSkip, take as mostTake, runEffects } from "@most/core"
import { newStream } from "@most/core"
import { newDefaultScheduler } from "@most/scheduler"
import type { Stream } from "@most/types"

// --- RxJS ---
import { lastValueFrom, from as rxFrom, skip as rxSkip, take as rxTake } from "rxjs"

// --- Helpers ---
import { range } from "./helpers.js"

const N = 1_000_000
const arr = range(N)

const mostFromArray = <A>(values: readonly A[]): Stream<A> =>
  newStream((sink, scheduler) => {
    const t = scheduler.currentTime()
    for (let i = 0; i < values.length; i++) {
      sink.event(t, values[i]!)
    }
    sink.end(t)
    return { dispose() {} }
  })

describe("take(100) from 1M", () => {
  bench("aeon", async () => {
    const scheduler = new VirtualScheduler()
    await drain(take(100, fromArray(arr)), scheduler)
  })

  bench("@most/core", async () => {
    const scheduler = newDefaultScheduler()
    await runEffects(mostTake(100, mostFromArray(arr)), scheduler)
  })

  bench("rxjs", async () => {
    await lastValueFrom(rxFrom(arr).pipe(rxTake(100)), { defaultValue: undefined })
  })
})

describe("drop(999_900) from 1M (take last 100)", () => {
  bench("aeon", async () => {
    const scheduler = new VirtualScheduler()
    await drain(drop(999_900, fromArray(arr)), scheduler)
  })

  bench("@most/core", async () => {
    const scheduler = newDefaultScheduler()
    await runEffects(mostSkip(999_900, mostFromArray(arr)), scheduler)
  })

  bench("rxjs", async () => {
    await lastValueFrom(rxFrom(arr).pipe(rxSkip(999_900)), { defaultValue: undefined })
  })
})
