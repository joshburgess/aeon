/**
 * Inverse of `collectEvents`: materialize a timed-entry list as an Event.
 *
 * Given a sorted `CollectedEntry` list, `fromEntries` builds an `Event<A, E>`
 * that, when run on a scheduler, emits exactly those entries **relative to
 * the subscription time**. Used by the law harness to round-trip arbitrary
 * event traces through typeclass instances, including as inner streams in
 * `flatMap` where subscription happens mid-trace.
 *
 * Contract:
 *   - Entries MUST be non-decreasing in `time`. Ties keep insertion order
 *     (requires FIFO tiebreaking in the scheduler heap).
 *   - Entry times are **offsets from subscription time**. An entry with
 *     `time: 0` fires immediately on subscribe; `time: 5` fires five ticks
 *     later, regardless of the scheduler's absolute clock.
 *   - The first `error` or `end` entry terminates the stream; any later
 *     entries are silently dropped. This mirrors pulse's single-termination
 *     invariant.
 *   - If no terminator is supplied, `fromEntries` emits only the value
 *     entries and never ends — use a trailing `{ type: "end" }` to close.
 *
 * Note: collected entries from `collectEvents` carry absolute times, so
 * round-tripping `collect ∘ fromEntries` only equals identity when the
 * source is subscribed at time 0. Tests using fresh `VirtualScheduler`s
 * (the common case) satisfy this.
 */

import type { CollectedEntry } from "aeon-test"
import type {
  Disposable,
  Duration,
  Event,
  ScheduledTask,
  Scheduler,
  Sink,
  Source,
  Time,
} from "aeon-types"

const toDelay = (offset: number): Duration => {
  if (offset < 0) {
    throw new Error(`fromEntries: negative entry offset ${offset}`)
  }
  return offset as Duration
}

class EntriesSource<A, E> implements Source<A, E> {
  declare readonly entries: readonly CollectedEntry<A, E>[]

  constructor(entries: readonly CollectedEntry<A, E>[]) {
    this.entries = entries
  }

  run(sink: Sink<A, E>, scheduler: Scheduler): Disposable {
    const scheduled: ScheduledTask[] = []
    let terminated = false

    const disposeAll = () => {
      for (const s of scheduled) s.dispose()
      scheduled.length = 0
    }

    for (const entry of this.entries) {
      if (terminated) break

      const delay = toDelay(entry.time as number)

      if (entry.type === "event") {
        const value = entry.value
        scheduled.push(
          scheduler.scheduleTask(delay, {
            run(t: Time) {
              sink.event(t, value)
            },
            error(t: Time, err: unknown) {
              sink.error(t, err as E)
            },
            dispose() {},
          }),
        )
      } else if (entry.type === "error") {
        const err = entry.error
        terminated = true
        scheduled.push(
          scheduler.scheduleTask(delay, {
            run(t: Time) {
              sink.error(t, err)
            },
            error(t: Time, e: unknown) {
              sink.error(t, e as E)
            },
            dispose() {},
          }),
        )
      } else {
        terminated = true
        scheduled.push(
          scheduler.scheduleTask(delay, {
            run(t: Time) {
              sink.end(t)
            },
            error(t: Time, e: unknown) {
              sink.error(t, e as E)
            },
            dispose() {},
          }),
        )
      }
    }

    return { dispose: disposeAll }
  }
}

/**
 * Build an `Event<A, E>` that replays a list of timed entries relative to
 * its subscription time. Entries must be time-sorted (non-decreasing) and
 * have non-negative times.
 */
export const fromEntries = <A, E = never>(entries: readonly CollectedEntry<A, E>[]): Event<A, E> =>
  new EntriesSource(entries) as unknown as Event<A, E>
