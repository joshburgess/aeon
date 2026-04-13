/**
 * Benchmarks for new Event operators: dedupe, exhaustMap,
 * race, forkJoin, pairwise, first, last, cons, elementAt.
 *
 * 3-way comparison: Aeon vs @most/core (where equivalent exists) vs RxJS.
 */

import { bench, describe } from "vitest"

// --- Aeon ---
import {
  cons,
  dedupe,
  drain,
  elementAt,
  exhaustMap,
  first,
  forkJoin,
  fromArray,
  last,
  pairwise,
  race,
} from "aeon-core"
import { VirtualScheduler } from "aeon-scheduler"

// --- @most/core ---
import {
  chain as mostChain,
  filter as mostFilter,
  map as mostMap,
  skip as mostSkip,
  take as mostTake,
  runEffects,
} from "@most/core"
import { newStream } from "@most/core"
import { newDefaultScheduler } from "@most/scheduler"
import type { Stream } from "@most/types"

// --- RxJS ---
import {
  lastValueFrom,
  distinctUntilChanged as rxDistinct,
  EMPTY as rxEmpty,
  exhaustMap as rxExhaustMap,
  first as rxFirst,
  forkJoin as rxForkJoin,
  from as rxFrom,
  last as rxLast,
  pairwise as rxPairwise,
  race as rxRace,
  startWith as rxStartWith,
} from "rxjs"

// --- Helpers ---
import { range } from "./helpers.js"

const N = 100_000
const arr = range(N)
// Array with many consecutive duplicates for dedupe
const dupsArr = arr.map((x) => Math.floor(x / 10))

const mostFromArray = <A>(values: readonly A[]): Stream<A> =>
  newStream((sink, scheduler) => {
    const t = scheduler.currentTime()
    for (let i = 0; i < values.length; i++) {
      sink.event(t, values[i]!)
    }
    sink.end(t)
    return { dispose() {} }
  })

// --- dedupe (100k, ~10k unique) ---

describe("dedupe (100k, ~10k unique)", () => {
  bench("aeon", async () => {
    const scheduler = new VirtualScheduler()
    await drain(dedupe(fromArray(dupsArr)), scheduler)
  })

  bench("@most/core (skipRepeats)", async () => {
    // @most/core has skipRepeats which is dedupe
    const { skipRepeats } = await import("@most/core")
    const scheduler = newDefaultScheduler()
    await runEffects(skipRepeats(mostFromArray(dupsArr)), scheduler)
  })

  bench("rxjs", async () => {
    await lastValueFrom(rxFrom(dupsArr).pipe(rxDistinct()), { defaultValue: undefined })
  })
})

// --- pairwise (100k) ---

describe("pairwise (100k)", () => {
  bench("aeon", async () => {
    const scheduler = new VirtualScheduler()
    await drain(pairwise(fromArray(arr)), scheduler)
  })

  // @most/core doesn't have built-in pairwise; skip

  bench("rxjs", async () => {
    await lastValueFrom(rxFrom(arr).pipe(rxPairwise()), { defaultValue: undefined })
  })
})

// --- first (100k) ---

describe("first (100k — early termination)", () => {
  bench("aeon", async () => {
    const scheduler = new VirtualScheduler()
    await drain(first(fromArray(arr)), scheduler)
  })

  bench("@most/core (take 1)", async () => {
    const scheduler = newDefaultScheduler()
    await runEffects(mostTake(1, mostFromArray(arr)), scheduler)
  })

  bench("rxjs", async () => {
    await lastValueFrom(rxFrom(arr).pipe(rxFirst()), { defaultValue: undefined })
  })
})

// --- last (100k) ---

describe("last (100k)", () => {
  bench("aeon", async () => {
    const scheduler = new VirtualScheduler()
    await drain(last(fromArray(arr)), scheduler)
  })

  // @most/core doesn't have built-in last; skip

  bench("rxjs", async () => {
    await lastValueFrom(rxFrom(arr).pipe(rxLast()), { defaultValue: undefined })
  })
})

// --- cons (100k) ---

describe("cons (100k)", () => {
  bench("aeon", async () => {
    const scheduler = new VirtualScheduler()
    await drain(cons(-1, fromArray(arr)), scheduler)
  })

  bench("@most/core (startWith)", async () => {
    const { startWith: mostStartWith } = await import("@most/core")
    const scheduler = newDefaultScheduler()
    await runEffects(mostStartWith(-1, mostFromArray(arr)), scheduler)
  })

  bench("rxjs", async () => {
    await lastValueFrom(rxFrom(arr).pipe(rxStartWith(-1)), { defaultValue: undefined })
  })
})

// --- exhaustMap (1000 × 1000) ---

const OUTER = 1000
const INNER = 1000
const outerArr = range(OUTER)
const innerArr = range(INNER)

describe("exhaustMap (1000 × 1000)", () => {
  bench("aeon", async () => {
    const scheduler = new VirtualScheduler()
    await drain(
      exhaustMap(() => fromArray(innerArr), fromArray(outerArr)),
      scheduler,
    )
  })

  // @most/core doesn't have exhaustMap; skip

  bench("rxjs", async () => {
    await lastValueFrom(rxFrom(outerArr).pipe(rxExhaustMap(() => rxFrom(innerArr))), {
      defaultValue: undefined,
    })
  })
})

// --- race (5 streams × 100k) ---

describe("race (5 × 100k)", () => {
  bench("aeon", async () => {
    const scheduler = new VirtualScheduler()
    await drain(
      race(fromArray(arr), fromArray(arr), fromArray(arr), fromArray(arr), fromArray(arr)),
      scheduler,
    )
  })

  // @most/core doesn't have race; skip

  bench("rxjs", async () => {
    await lastValueFrom(rxRace(rxFrom(arr), rxFrom(arr), rxFrom(arr), rxFrom(arr), rxFrom(arr)), {
      defaultValue: undefined,
    })
  })
})

// --- forkJoin (5 streams × 100k) ---

describe("forkJoin (5 × 100k)", () => {
  bench("aeon", async () => {
    const scheduler = new VirtualScheduler()
    await drain(
      forkJoin(fromArray(arr), fromArray(arr), fromArray(arr), fromArray(arr), fromArray(arr)),
      scheduler,
    )
  })

  // @most/core doesn't have forkJoin; skip

  bench("rxjs", async () => {
    await lastValueFrom(
      rxForkJoin([rxFrom(arr), rxFrom(arr), rxFrom(arr), rxFrom(arr), rxFrom(arr)]),
      { defaultValue: undefined },
    )
  })
})

// --- elementAt (100k, pick middle) ---

describe("elementAt (100k, pick 50000th)", () => {
  bench("aeon", async () => {
    const scheduler = new VirtualScheduler()
    await drain(elementAt(50000, fromArray(arr)), scheduler)
  })

  bench("@most/core (skip + take)", async () => {
    const scheduler = newDefaultScheduler()
    await runEffects(mostTake(1, mostSkip(50000, mostFromArray(arr))), scheduler)
  })

  bench("rxjs (first with index)", async () => {
    await lastValueFrom(rxFrom(arr).pipe(rxFirst((_v, i) => i === 50000)), {
      defaultValue: undefined,
    })
  })
})
