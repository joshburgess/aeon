/**
 * Behavioral tests for the `aeon-effect/bridge` module.
 *
 * These are case-based (not law-based): each property asserts a single
 * directional behavior of `toStream` / `fromStream` against the aeon runtime
 * on one side and the Effect runtime on the other.
 *
 * Timing strategy: toStream tests use a `DefaultScheduler` because aeon's
 * sync sources (`fromArray`, `throwError`) emit during `source.run` and the
 * Effect buffer consumes them on the next microtask. fromStream tests use a
 * `VirtualScheduler` for the aeon side so timestamps are deterministic, and
 * wait on a completion `Promise` before asserting because the Effect fiber
 * runs on a real runtime.
 */

import * as Chunk from "effect/Chunk"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Stream from "effect/Stream"
import { describe, expect, it } from "vitest"

import { fromArray, throwError } from "aeon-core"
import { DefaultScheduler, VirtualScheduler } from "aeon-scheduler"
import { collectEvents } from "aeon-test"
import type { Disposable, Event, Scheduler, Sink, Source } from "aeon-types"

import { fromStream, toStream } from "../src/bridge.js"

const realScheduler = new DefaultScheduler()

/**
 * Wrap an existing Event so we can observe when its subscription is
 * disposed. Forwards all sink callbacks unchanged.
 */
const spyEvent = <A, E>(
  inner: Event<A, E>,
): { readonly event: Event<A, E>; readonly disposed: () => boolean } => {
  let disposed = false
  const innerSource = inner as unknown as Source<A, E>
  const source: Source<A, E> = {
    run(sink: Sink<A, E>, scheduler: Scheduler): Disposable {
      const sub = innerSource.run(sink, scheduler)
      return {
        dispose() {
          disposed = true
          sub.dispose()
        },
      }
    },
  }
  return { event: source as unknown as Event<A, E>, disposed: () => disposed }
}

describe("toStream", () => {
  it("forwards values in order and signals end", async () => {
    const event = fromArray([1, 2, 3])
    const stream = toStream(event, realScheduler)
    const chunk = await Effect.runPromise(Stream.runCollect(stream))
    expect(Chunk.toReadonlyArray(chunk)).toEqual([1, 2, 3])
  })

  it("terminates immediately on empty Event (of an ended source)", async () => {
    const stream = toStream(fromArray<number>([]), realScheduler)
    const chunk = await Effect.runPromise(Stream.runCollect(stream))
    expect(Chunk.toReadonlyArray(chunk)).toEqual([])
  })

  it("propagates typed errors as Stream failures", async () => {
    const event = throwError<number, string>("boom")
    const stream = toStream(event, realScheduler)
    const exit = await Effect.runPromise(Effect.exit(Stream.runCollect(stream)))
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      // Failure cause carries the string error on the typed failure channel.
      const pretty = JSON.stringify(exit.cause)
      expect(pretty).toContain("boom")
    }
  })

  it("disposes the aeon subscription when the Stream scope closes", async () => {
    const { event, disposed } = spyEvent(fromArray([1, 2, 3]))
    // Runs to completion — Effect closes the Stream's scope on end, which
    // must fire our acquireRelease finalizer and dispose the subscription.
    await Effect.runPromise(Stream.runCollect(toStream(event, realScheduler)))
    expect(disposed()).toBe(true)
  })
})

describe("fromStream", () => {
  /**
   * Wait for the aeon subscription to terminate (end OR error), guarded by
   * a safety timeout so a misbehaving test can't hang the suite.
   */
  const awaitTermination = <A, E>(result: {
    readonly ended: boolean
    readonly errored: boolean
  }): Promise<void> => {
    const start = Date.now()
    return new Promise((resolve, reject) => {
      const tick = () => {
        if (result.ended || result.errored) return resolve()
        if (Date.now() - start > 1000) return reject(new Error("timeout"))
        setTimeout(tick)
      }
      tick()
    })
  }

  it("forwards values in order and signals end", async () => {
    const stream = Stream.fromIterable([1, 2, 3])
    const event = fromStream<number, never>(stream)
    const scheduler = new VirtualScheduler()
    const result = collectEvents(event, scheduler)
    await awaitTermination(result)
    expect(result.values).toEqual([1, 2, 3])
    expect(result.ended).toBe(true)
    expect(result.errored).toBe(false)
    result.disposable.dispose()
  })

  it("signals end on a completed empty Stream", async () => {
    const event = fromStream<number, never>(Stream.empty)
    const scheduler = new VirtualScheduler()
    const result = collectEvents(event, scheduler)
    await awaitTermination(result)
    expect(result.values).toEqual([])
    expect(result.ended).toBe(true)
    result.disposable.dispose()
  })

  it("routes typed Stream failures through sink.error", async () => {
    const stream = Stream.fail<string>("boom")
    const event = fromStream<number, string>(stream)
    const scheduler = new VirtualScheduler()
    const result = collectEvents(event, scheduler)
    await awaitTermination(result)
    expect(result.errored).toBe(true)
    expect(result.error).toBe("boom")
    expect(result.ended).toBe(false)
    result.disposable.dispose()
  })

  it("interrupts the underlying fiber on dispose — no further emissions", async () => {
    // An infinite stream that would keep emitting forever; dispose should
    // stop it after at most a handful of values.
    const stream = Stream.repeatValue(42)
    const event = fromStream<number, never>(stream)
    const scheduler = new VirtualScheduler()
    const result = collectEvents(event, scheduler)
    // Let the fiber push a bit, then dispose.
    await new Promise((r) => setTimeout(r))
    result.disposable.dispose()
    const countAtDispose = result.values.length
    // Yield again — no new values should land after dispose (the `closed`
    // flag in the sink wrapper ensures it even if the fiber is still
    // draining in-flight microtasks).
    await new Promise((r) => setTimeout(r, 10))
    expect(result.values.length).toBe(countAtDispose)
    expect(result.ended).toBe(false)
    expect(result.errored).toBe(false)
  })
})

describe("round-trip", () => {
  it("toStream → fromStream preserves values (sequence-only)", async () => {
    const event = fromArray([10, 20, 30])
    const roundTripped = fromStream<number, never>(toStream(event, realScheduler))
    const scheduler = new VirtualScheduler()
    const result = collectEvents(roundTripped, scheduler)
    const start = Date.now()
    while (!result.ended && !result.errored && Date.now() - start < 1000) {
      await new Promise((r) => setTimeout(r))
    }
    expect(result.values).toEqual([10, 20, 30])
    expect(result.ended).toBe(true)
    result.disposable.dispose()
  })
})
