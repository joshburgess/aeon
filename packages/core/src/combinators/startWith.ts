/**
 * startWith combinator.
 *
 * Denotation: `startWith(value, e) = [(t₀, value)] ++ e`
 * Prepends a synchronous initial value before the first event.
 */

import type { Disposable, Event, Scheduler, Sink, Source, Time } from "@pulse/types";
import { _createEvent, _getSource } from "../internal/event.js";

class StartWithSource<A, E> implements Source<A, E> {
  declare readonly value: A;
  declare readonly source: Source<A, E>;

  constructor(value: A, source: Source<A, E>) {
    this.value = value;
    this.source = source;
  }

  run(sink: Sink<A, E>, scheduler: Scheduler): Disposable {
    sink.event(scheduler.currentTime(), this.value);
    return this.source.run(sink, scheduler);
  }
}

/**
 * Prepend an initial value before the first event.
 *
 * Denotation: `startWith(value, e) = [(t₀, value)] ++ e`
 */
export const startWith = <A, E>(value: A, event: Event<A, E>): Event<A, E> =>
  _createEvent(new StartWithSource(value, _getSource(event)));
