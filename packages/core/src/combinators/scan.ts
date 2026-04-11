/**
 * scan combinator.
 *
 * Denotation: `scan(f, seed, e) = [(t, foldl f seed (values up to t)) | (t, _) ∈ e]`
 *
 * Includes fusion: scan(f, seed, map(g, s)) → scanMap with composed function.
 */

import type { Disposable, Event, Scheduler, Sink, Source, Time } from "@pulse/types";
import { _EmptySource, _EMPTY_SOURCE } from "../constructors.js";
import { _createEvent, _getSource } from "../internal/event.js";
import { _MapSource } from "../internal/fusion.js";
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
  declare readonly _sync: boolean;

  constructor(f: (acc: B, a: A) => B, seed: B, source: Source<A, E>) {
    this.f = f;
    this.seed = seed;
    this.source = source;
    this._sync = (source as any)._sync === true;
  }

  run(sink: Sink<B, E>, scheduler: Scheduler): Disposable {
    return this.source.run(new ScanSink(this.f, this.seed, sink), scheduler);
  }

  syncIterate(emit: (value: B) => boolean): void {
    const f = this.f;
    let acc = this.seed;
    (this.source as any).syncIterate((v: A) => {
      acc = f(acc, v);
      return emit(acc);
    });
  }
}

/**
 * Incrementally accumulate values, emitting each intermediate result.
 *
 * Denotation: produces a running fold of the event sequence.
 */
export const scan = <A, B, E>(f: (acc: B, a: A) => B, seed: B, event: Event<A, E>): Event<B, E> => {
  const source = _getSource(event);

  // scan(f, seed, empty()) → empty()
  if (source instanceof _EmptySource) {
    return _createEvent(_EMPTY_SOURCE as unknown as Source<B, E>);
  }

  // scan(f, seed, map(g, s)) → scan((acc, x) => f(acc, g(x)), seed, s)
  if (source instanceof _MapSource) {
    const inner = source as InstanceType<typeof _MapSource<unknown, A, any>>;
    const g = inner.f;
    return _createEvent(
      new ScanSource((acc: B, x: unknown) => f(acc, g(x) as A), seed, inner.source as Source<unknown, E>),
    );
  }

  return _createEvent(new ScanSource(f, seed, source));
};
