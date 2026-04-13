/**
 * Benchmark: flatMap (chain) — 1000 outer × 1000 inner.
 *
 * Tests the overhead of creating and subscribing to inner streams.
 */

import { bench, describe } from "vitest"

// --- Aeon ---
import { chain, drain, fromArray } from "aeon-core"
import { VirtualScheduler } from "aeon-scheduler"

// --- @most/core ---
import { chain as mostChain, runEffects } from "@most/core"
import { newStream } from "@most/core"
import { newDefaultScheduler } from "@most/scheduler"
import type { Stream } from "@most/types"

// --- RxJS ---
import { lastValueFrom, mergeMap, EMPTY as rxEmpty, from as rxFrom } from "rxjs"

// --- Helpers ---
import { range } from "./helpers.js"

const OUTER = 1000
const INNER = 1000
const outerArr = range(OUTER)
const innerArr = range(INNER)

const mostFromArray = <A>(values: readonly A[]): Stream<A> =>
  newStream((sink, scheduler) => {
    const t = scheduler.currentTime()
    for (let i = 0; i < values.length; i++) {
      sink.event(t, values[i]!)
    }
    sink.end(t)
    return { dispose() {} }
  })

describe("flatMap (1000 × 1000)", () => {
  bench("aeon", async () => {
    const scheduler = new VirtualScheduler()
    await drain(
      chain(() => fromArray(innerArr), fromArray(outerArr)),
      scheduler,
    )
  })

  bench("@most/core", async () => {
    const scheduler = newDefaultScheduler()
    await runEffects(
      mostChain(() => mostFromArray(innerArr), mostFromArray(outerArr)),
      scheduler,
    )
  })

  bench("rxjs", async () => {
    await lastValueFrom(rxFrom(outerArr).pipe(mergeMap(() => rxFrom(innerArr), 1)), {
      defaultValue: undefined,
    })
  })
})
