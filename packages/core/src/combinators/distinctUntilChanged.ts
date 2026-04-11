/**
 * distinctUntilChanged combinator.
 *
 * Denotation: suppress consecutive duplicate values.
 * `distinctUntilChanged(eq, e) = [(t, v) | (t, v) ∈ e, v ≠ prev]`
 * where `prev` is the most recently emitted value.
 */

import type { Disposable, Event, Scheduler, Sink, Source, Time } from "@pulse/types";
import { Pipe } from "../internal/Pipe.js";
import { _createEvent, _getSource } from "../internal/event.js";

class DistinctUntilChangedSink<A, E> extends Pipe<A, E> {
  declare readonly eq: (a: A, b: A) => boolean;
  declare prev: A | typeof UNSET;

  constructor(eq: (a: A, b: A) => boolean, sink: Sink<A, E>) {
    super(sink);
    this.eq = eq;
    this.prev = UNSET;
  }

  event(time: Time, value: A): void {
    if (this.prev === UNSET || !this.eq(this.prev as A, value)) {
      this.prev = value;
      this.sink.event(time, value);
    }
  }
}

const UNSET: unique symbol = Symbol("unset");

class DistinctUntilChangedSource<A, E> implements Source<A, E> {
  declare readonly eq: (a: A, b: A) => boolean;
  declare readonly source: Source<A, E>;

  constructor(eq: (a: A, b: A) => boolean, source: Source<A, E>) {
    this.eq = eq;
    this.source = source;
  }

  run(sink: Sink<A, E>, scheduler: Scheduler): Disposable {
    return this.source.run(new DistinctUntilChangedSink(this.eq, sink), scheduler);
  }
}

const defaultEq = <A>(a: A, b: A): boolean => a === b;

/**
 * Suppress consecutive duplicate values.
 *
 * Denotation: emits a value only when it differs from the previous
 * emission, according to the provided equality function (defaults to `===`).
 */
export const distinctUntilChanged = <A, E>(
  event: Event<A, E>,
  eq: (a: A, b: A) => boolean = defaultEq,
): Event<A, E> => _createEvent(new DistinctUntilChangedSource(eq, _getSource(event)));
