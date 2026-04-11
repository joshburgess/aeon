/**
 * scan combinator.
 *
 * Denotation: `scan(f, seed, e) = [(t, foldl f seed (values up to t)) | (t, _) ∈ e]`
 */

import type { Disposable, Event, Scheduler, Sink, Source, Time } from "@pulse/types";
import { _createEvent, _getSource } from "../internal/event.js";
import { Pipe } from "../internal/Pipe.js";

class ScanSink<A, B, E> extends Pipe<B, E> implements Sink<A, E> {
  declare readonly f: (acc: B, a: A) => B;
  declare acc: B;

  constructor(f: (acc: B, a: A) => B, seed: B, sink: Sink<B, E>) {
    super(sink);
    this.f = f;
    this.acc = seed;
  }

  event(time: Time, value: A): void {
    const f = this.f;
    const acc = f(this.acc, value);
    this.acc = acc;
    this.sink.event(time, acc);
  }
}

class ScanSource<A, B, E> implements Source<B, E> {
  declare readonly f: (acc: B, a: A) => B;
  declare readonly seed: B;
  declare readonly source: Source<A, E>;

  constructor(f: (acc: B, a: A) => B, seed: B, source: Source<A, E>) {
    this.f = f;
    this.seed = seed;
    this.source = source;
  }

  run(sink: Sink<B, E>, scheduler: Scheduler): Disposable {
    return this.source.run(new ScanSink(this.f, this.seed, sink), scheduler);
  }
}

/**
 * Incrementally accumulate values, emitting each intermediate result.
 *
 * Denotation: produces a running fold of the event sequence.
 */
export const scan = <A, B, E>(f: (acc: B, a: A) => B, seed: B, event: Event<A, E>): Event<B, E> => {
  const source = _getSource(event);
  return _createEvent(new ScanSource(f, seed, source));
};
