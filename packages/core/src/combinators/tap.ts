/**
 * tap combinator.
 *
 * Runs a side effect for each value without altering the stream.
 * Denotation: identity on the event sequence (side effects are invisible to the denotation).
 */

import type { Disposable, Event, Scheduler, Sink, Source, Time } from "aeon-types";
import { Pipe } from "../internal/Pipe.js";
import { _createEvent, _getSource } from "../internal/event.js";

class TapSink<A, E> extends Pipe<A, E> {
  declare readonly f: (a: A) => void;

  constructor(f: (a: A) => void, sink: Sink<A, E>) {
    super(sink);
    this.f = f;
  }

  event(time: Time, value: A): void {
    const f = this.f;
    f(value);
    this.sink.event(time, value);
  }
}

class TapSource<A, E> implements Source<A, E> {
  declare readonly f: (a: A) => void;
  declare readonly source: Source<A, E>;

  constructor(f: (a: A) => void, source: Source<A, E>) {
    this.f = f;
    this.source = source;
  }

  run(sink: Sink<A, E>, scheduler: Scheduler): Disposable {
    return this.source.run(new TapSink(this.f, sink), scheduler);
  }
}

/**
 * Run a side-effect for each event value, passing values through unchanged.
 */
export const tap = <A, E>(f: (a: A) => void, event: Event<A, E>): Event<A, E> =>
  _createEvent(new TapSource(f, _getSource(event)));
