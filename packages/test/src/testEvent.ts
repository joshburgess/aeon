/**
 * Test stream creation from marble notation.
 *
 * Creates a pulse Event that emits values according to a marble string,
 * scheduled on a VirtualScheduler.
 */

import type {
  Disposable,
  Duration,
  Event as PulseEvent,
  Scheduler,
  Sink,
  Source,
  Time,
} from "aeon-types"
import { toDuration, toTime } from "aeon-types"
import { type MarbleEntry, parseMarble } from "./marble.js"

class MarbleSource<A, E> implements Source<A, E> {
  declare readonly entries: MarbleEntry<A, E>[]

  constructor(entries: MarbleEntry<A, E>[]) {
    this.entries = entries
  }

  run(sink: Sink<A, E>, scheduler: Scheduler): Disposable {
    const disposables: Disposable[] = []
    const currentTime = scheduler.currentTime() as number

    for (const entry of this.entries) {
      const delay = toDuration((entry.time as number) - currentTime)

      switch (entry.type) {
        case "event": {
          const value = entry.value
          disposables.push(
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
          break
        }
        case "error": {
          const error = entry.error
          disposables.push(
            scheduler.scheduleTask(delay, {
              run(t: Time) {
                sink.error(t, error)
              },
              error() {},
              dispose() {},
            }),
          )
          break
        }
        case "end": {
          disposables.push(
            scheduler.scheduleTask(delay, {
              run(t: Time) {
                sink.end(t)
              },
              error() {},
              dispose() {},
            }),
          )
          break
        }
      }
    }

    return {
      dispose() {
        for (const d of disposables) d.dispose()
      },
    }
  }
}

/**
 * Create a pulse Event from a marble string.
 *
 * Events are scheduled on the provided scheduler. Use with VirtualScheduler
 * and advance/flush to control time.
 *
 * @param marble - Marble notation string
 * @param values - Map from single-character keys to values
 * @param error - Error value for `#` in the marble string
 * @param timeUnit - Milliseconds per time unit (default: 1)
 */
export const testEvent = <A, E = never>(
  marble: string,
  values: Record<string, A>,
  error?: E,
  timeUnit?: number,
): PulseEvent<A, E> => {
  const entries = parseMarble<A, E>(marble, values, error, timeUnit)
  return new MarbleSource(entries) as unknown as PulseEvent<A, E>
}
