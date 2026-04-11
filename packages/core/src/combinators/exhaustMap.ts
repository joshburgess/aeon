/**
 * exhaustMap combinator.
 *
 * Denotation: while an inner stream is active, ignore new outer values.
 * The counterpart to switchLatest (which cancels) and mergeMap (which
 * runs all concurrently).
 */

import type { Disposable, Event, Scheduler, Sink, Source, Time } from "@pulse/types";
import { _createEvent, _getSource } from "../internal/event.js";

class ExhaustMapInnerSink<B, E> implements Sink<B, E> {
  declare readonly outer: ExhaustMapSink<unknown, B, E>;

  constructor(outer: ExhaustMapSink<unknown, B, E>) {
    this.outer = outer;
  }

  event(time: Time, value: B): void {
    this.outer.sink.event(time, value);
  }

  error(time: Time, err: E): void {
    this.outer.sink.error(time, err);
  }

  end(time: Time): void {
    this.outer.innerActive = false;
    this.outer.innerDisposable = undefined;
    if (this.outer.outerEnded) {
      this.outer.sink.end(time);
    }
  }
}

class ExhaustMapSink<A, B, E> implements Sink<A, E> {
  declare readonly sink: Sink<B, E>;
  declare readonly f: (a: A) => Event<B, E>;
  declare readonly scheduler: Scheduler;
  declare innerActive: boolean;
  declare innerDisposable: Disposable | undefined;
  declare outerEnded: boolean;

  constructor(f: (a: A) => Event<B, E>, sink: Sink<B, E>, scheduler: Scheduler) {
    this.f = f;
    this.sink = sink;
    this.scheduler = scheduler;
    this.innerActive = false;
    this.innerDisposable = undefined;
    this.outerEnded = false;
  }

  event(_time: Time, value: A): void {
    if (this.innerActive) return; // Ignore while inner is active
    this.innerActive = true;
    const f = this.f;
    const inner = f(value);
    this.innerDisposable = _getSource(inner).run(
      new ExhaustMapInnerSink<B, E>(this as ExhaustMapSink<unknown, B, E>),
      this.scheduler,
    );
  }

  error(time: Time, err: E): void {
    this.sink.error(time, err);
  }

  end(time: Time): void {
    this.outerEnded = true;
    if (!this.innerActive) {
      this.sink.end(time);
    }
  }
}

class ExhaustMapSource<A, B, E> implements Source<B, E> {
  declare readonly f: (a: A) => Event<B, E>;
  declare readonly source: Source<A, E>;

  constructor(f: (a: A) => Event<B, E>, source: Source<A, E>) {
    this.f = f;
    this.source = source;
  }

  run(sink: Sink<B, E>, scheduler: Scheduler): Disposable {
    const exhaustSink = new ExhaustMapSink(this.f, sink, scheduler);
    const d = this.source.run(exhaustSink, scheduler);
    return {
      dispose() {
        if (exhaustSink.innerDisposable !== undefined) {
          exhaustSink.innerDisposable.dispose();
        }
        d.dispose();
      },
    };
  }
}

/**
 * Map each outer value to an inner Event, ignoring new outer values
 * while the current inner is still active.
 *
 * Denotation: projects outer values to inner streams, but drops
 * projections that arrive while an inner stream is running.
 */
export const exhaustMap = <A, B, E>(f: (a: A) => Event<B, E>, event: Event<A, E>): Event<B, E> =>
  _createEvent(new ExhaustMapSource(f, _getSource(event)));
