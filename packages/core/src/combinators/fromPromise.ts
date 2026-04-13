/**
 * fromPromise constructor.
 *
 * Denotation: `fromPromise(p) = [(t_resolve, value)]` or `Error(rejection)`
 * where `t_resolve` is the time at which the promise settles.
 */

import type { Disposable, Event, Scheduler, Sink, Source, Time } from "aeon-types"
import { _createEvent } from "../internal/event.js"

class FromPromiseSource<A> implements Source<A, unknown> {
  declare readonly promise: Promise<A>

  constructor(promise: Promise<A>) {
    this.promise = promise
  }

  run(sink: Sink<A, unknown>, scheduler: Scheduler): Disposable {
    let disposed = false

    this.promise.then(
      (value) => {
        if (!disposed) {
          const t = scheduler.currentTime()
          sink.event(t, value)
          sink.end(t)
        }
      },
      (err) => {
        if (!disposed) {
          sink.error(scheduler.currentTime(), err)
        }
      },
    )

    return {
      dispose() {
        disposed = true
      },
    }
  }
}

/**
 * Create an Event from a Promise.
 *
 * The event emits the resolved value at the time the promise settles,
 * then ends. If the promise rejects, the event errors.
 *
 * Denotation: `[(t_resolve, value)]` or `Error(rejection)`
 */
export const fromPromise = <A>(promise: Promise<A>): Event<A, unknown> =>
  _createEvent(new FromPromiseSource(promise))
