/**
 * Example 02 — Bridging aeon Event <-> Effect Stream.
 *
 * Demonstrates both directions of the bridge:
 *
 *   `toStream`   — consume an aeon Event from inside an Effect program,
 *                  composing it with Effect's Stream combinators.
 *   `fromStream` — drive an Effect Stream through aeon's runtime as a
 *                  regular Event (lifts fiber lifecycle into a Disposable).
 *
 * Run:   pnpm ex:bridge
 */

import { map as coreMap, fromArray, observe, periodic, take } from "aeon-core"
import { fromStream, toStream } from "aeon-effect/bridge"
import { DefaultScheduler } from "aeon-scheduler"
import { toDuration } from "aeon-types"
import * as Chunk from "effect/Chunk"
import * as Effect from "effect/Effect"
import * as Stream from "effect/Stream"

const scheduler = new DefaultScheduler()

// --- toStream: aeon -> Effect Stream ------------------------------------------
// Wrap an aeon Event as an Effect Stream and apply pure Effect combinators
// (map, take, runCollect). The aeon subscription lives inside the Stream's
// acquireRelease scope, so interrupting the Stream disposes it.
console.log("\n--- toStream: sum aeon values inside an Effect program ---")
{
  let i = 0
  const source = take(
    5,
    coreMap(() => i++, periodic(toDuration(10))),
  )
  const stream = toStream(source, scheduler)

  const sumEffect = Stream.runFold(stream, 0, (acc, n) => acc + n)
  const total = await Effect.runPromise(sumEffect)
  console.log("[sum 0..4]", total) // 10
}

// --- fromStream: Effect Stream -> aeon Event ----------------------------------
// Take a Stream produced inside an Effect pipeline (here: `Stream.fromIterable`
// + `Stream.map`) and expose it as an aeon Event. Each aeon subscription
// forks an Effect fiber; disposing the subscription interrupts the fiber.
console.log("\n--- fromStream: observe an Effect Stream via aeon ---")
{
  const effectStream = Stream.fromIterable([1, 2, 3, 4, 5]).pipe(
    Stream.map((n) => n * n),
    Stream.filter((n) => n > 5),
  )
  const event = fromStream<number, never>(effectStream)
  await observe((v) => console.log("[squared>5]", v), event, scheduler)
}

// --- Round-trip ---------------------------------------------------------------
// Because both adapters preserve value order, composing them is a no-op on
// the emitted sequence (timestamps do not round-trip: Effect Streams have no
// notion of emission time, so `fromStream ∘ toStream` normalizes everything
// to the aeon scheduler's clock at consumption time).
console.log("\n--- Round-trip: aeon -> Stream -> aeon ---")
{
  const src = fromArray([10, 20, 30])
  const roundTripped = fromStream<number, never>(toStream(src, scheduler))
  await observe((v) => console.log("[round-trip]", v), roundTripped, scheduler)
}

// --- Inside an Effect program ------------------------------------------------
// More realistic: build a whole Effect program that logs each value and
// collects them at the end. Mixing aeon as a producer with Effect for
// orchestration is the primary motivation for the bridge.
console.log("\n--- Effect program consuming an aeon Event ---")
{
  let i = 0
  const source = take(
    3,
    coreMap(() => i++, periodic(toDuration(5))),
  )
  const program = toStream(source, scheduler).pipe(
    Stream.tap((n) => Effect.sync(() => console.log("[tap]", n))),
    Stream.runCollect,
  )
  const collected = await Effect.runPromise(program)
  console.log("[collected]", Chunk.toReadonlyArray(collected))
}
