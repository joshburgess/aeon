/**
 * Bridge between aeon-core `Event<A, E>` and Effect `Stream<A, E, R>`.
 *
 * These adapters let callers embed aeon pipelines inside Effect programs
 * (`toStream`) or consume an Effect `Stream` as an aeon `Event` (`fromStream`).
 *
 * Lifecycle invariants:
 *   - `toStream`: the aeon subscription is acquired when the Stream is run
 *     and disposed when the Stream is interrupted or ends.
 *   - `fromStream`: the Effect fiber is forked when the Event is subscribed
 *     and interrupted when the subscription's `dispose` is called.
 *
 * Timing: `fromStream` uses the aeon scheduler's `currentTime()` for all
 * emissions — no Effect `Clock` is consulted — so virtual-time tests stay
 * deterministic. `toStream` preserves values but not aeon timestamps (Effect
 * Streams have no notion of discrete emission time).
 */

import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Option from "effect/Option"
import * as Stream from "effect/Stream"

import type { Event, Scheduler, Sink, Source } from "aeon-types"

export interface ToStreamOptions {
  /**
   * Buffer strategy for the Effect Stream side. Defaults to `"unbounded"`.
   *
   * Use a bounded size + `"dropping"` or `"sliding"` strategy when the
   * aeon producer may outrun the Effect consumer.
   */
  readonly bufferSize?:
    | "unbounded"
    | number
    | { readonly bufferSize: number; readonly strategy: "dropping" | "sliding" }
}

/**
 * Lift an aeon `Event` to an Effect `Stream`.
 *
 * The aeon subscription is acquired inside `Effect.acquireRelease`, so the
 * Stream's scope owns its lifetime. Disposal of the Stream disposes the
 * subscription.
 *
 * `event` is structurally a `Source` at runtime (the `EventBrand` is purely
 * type-level — see aeon-core's `internal/event.ts`); the cast is zero-cost
 * and matches aeon's own `_getSource` helper.
 */
export const toStream = <A, E = never>(
  event: Event<A, E>,
  scheduler: Scheduler,
  options: ToStreamOptions = {},
): Stream.Stream<A, E, never> => {
  const source = event as unknown as Source<A, E>

  const pushOptions =
    options.bufferSize === undefined || options.bufferSize === "unbounded"
      ? ({ bufferSize: "unbounded" } as const)
      : typeof options.bufferSize === "number"
        ? { bufferSize: options.bufferSize }
        : options.bufferSize

  return Stream.asyncPush<A, E>(
    (emit) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          // The sink methods ignore `time` — Effect Streams have no
          // discrete emission timestamp, so aeon times don't round-trip.
          const sink: Sink<A, E> = {
            event(_time, value) {
              emit.single(value)
            },
            error(_time, err) {
              emit.fail(err)
            },
            end(_time) {
              emit.end()
            },
          }
          return source.run(sink, scheduler)
        }),
        (disposable) => Effect.sync(() => disposable.dispose()),
      ),
    pushOptions,
  )
}

/**
 * Lift an Effect `Stream` to an aeon `Event`.
 *
 * Each subscription forks an independent fiber that runs the Stream and
 * pushes every emission to the aeon sink, using the subscription-time
 * scheduler's clock for all timestamps.
 *
 * Disposal interrupts the fiber via `Fiber.interrupt`. A `closed` flag
 * guards against emissions from still-running Effect code between the
 * `dispose()` call and the fiber actually releasing — the aeon Sink
 * contract forbids calling `event`/`error`/`end` after disposal.
 *
 * Errors and defects: expected failures (`Cause.Fail`) forward as
 * `sink.error(t, e)`. Defects (`Cause.Die`), interrupts during normal run,
 * and composite causes are squashed to a single error value routed through
 * the same channel — aeon has no separate defect track, and swallowing
 * them silently would hide bugs. Interruption triggered by our own
 * `dispose()` is filtered out since the subscriber explicitly cancelled.
 */
export const fromStream = <A, E = never>(stream: Stream.Stream<A, E, never>): Event<A, E> => {
  const source: Source<A, E> = {
    run(sink, scheduler) {
      let closed = false

      const run = Stream.runForEach(stream, (a: A) =>
        Effect.sync(() => {
          if (!closed) sink.event(scheduler.currentTime(), a)
        }),
      )

      const handled = Effect.matchCauseEffect(run, {
        onFailure: (cause) =>
          Effect.sync(() => {
            if (closed) return
            if (Cause.isInterruptedOnly(cause)) return
            const failure = Cause.failureOption(cause)
            if (Option.isSome(failure)) {
              sink.error(scheduler.currentTime(), failure.value)
            } else {
              sink.error(scheduler.currentTime(), Cause.squash(cause) as E)
            }
          }),
        onSuccess: () =>
          Effect.sync(() => {
            if (!closed) sink.end(scheduler.currentTime())
          }),
      })

      const fiber = Effect.runFork(handled)

      return {
        dispose() {
          if (closed) return
          closed = true
          Effect.runFork(Fiber.interrupt(fiber))
        },
      }
    },
  }
  return source as unknown as Event<A, E>
}
