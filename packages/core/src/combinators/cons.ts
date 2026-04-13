/**
 * cons combinator.
 *
 * Denotation: `cons(value, e) = [(t₀, value)] ++ e`
 * Prepends a synchronous initial value before the first event.
 */

import type { Disposable, Event, Scheduler, Sink, Source, Time } from "aeon-types"
import { _createEvent, _getSource } from "../internal/event.js"

class ConsSource<A, E> implements Source<A, E> {
  declare readonly value: A
  declare readonly source: Source<A, E>

  constructor(value: A, source: Source<A, E>) {
    this.value = value
    this.source = source
  }

  run(sink: Sink<A, E>, scheduler: Scheduler): Disposable {
    sink.event(scheduler.currentTime(), this.value)
    return this.source.run(sink, scheduler)
  }
}

/**
 * Prepend an initial value before the first event.
 *
 * Denotation: `cons(value, e) = [(t₀, value)] ++ e`
 */
export const cons = <A, E>(value: A, event: Event<A, E>): Event<A, E> =>
  _createEvent(new ConsSource(value, _getSource(event)))
