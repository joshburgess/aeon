/**
 * chain combinator.
 *
 * Denotation: `chain(f, e) = concat(map(f, e))` — each inner stream
 * runs to completion before the next begins.
 *
 * Uses monomorphic Sink/Source classes for V8 hidden class stability.
 */

import type { Disposable, Event, Scheduler, Sink, Source, Time } from "aeon-types";
import { SettableDisposable } from "../internal/dispose.js";
import { _createEvent, _getSource } from "../internal/event.js";

class ChainInnerSink<B, E> implements Sink<B, E> {
  declare readonly outer: ChainSink<unknown, B, E>;

  constructor(outer: ChainSink<unknown, B, E>) {
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
    if (this.outer.queue.length > 0) {
      this.outer.startInner(this.outer.queue.shift()!);
    } else if (this.outer.outerEnded) {
      this.outer.sink.end(time);
    }
  }
}

class ChainSink<A, B, E> implements Sink<A, E> {
  declare readonly sink: Sink<B, E>;
  declare readonly f: (a: A) => Event<B, E>;
  declare readonly scheduler: Scheduler;
  declare readonly outerDisposable: SettableDisposable;
  declare innerDisposable: Disposable | undefined;
  declare outerEnded: boolean;
  declare readonly queue: Event<B, E>[];
  declare innerActive: boolean;

  constructor(
    f: (a: A) => Event<B, E>,
    sink: Sink<B, E>,
    scheduler: Scheduler,
    outerDisposable: SettableDisposable,
  ) {
    this.f = f;
    this.sink = sink;
    this.scheduler = scheduler;
    this.outerDisposable = outerDisposable;
    this.innerDisposable = undefined;
    this.outerEnded = false;
    this.queue = [];
    this.innerActive = false;
  }

  event(_time: Time, value: A): void {
    const f = this.f;
    const inner = f(value);
    if (this.innerActive) {
      this.queue.push(inner);
    } else {
      this.startInner(inner);
    }
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

  startInner(inner: Event<B, E>): void {
    this.innerActive = true;
    if (this.innerDisposable !== undefined) {
      this.innerDisposable.dispose();
    }

    this.innerDisposable = _getSource(inner).run(
      new ChainInnerSink<B, E>(this as ChainSink<unknown, B, E>),
      this.scheduler,
    );
  }
}

class ChainSource<A, B, E> implements Source<B, E> {
  declare readonly f: (a: A) => Event<B, E>;
  declare readonly source: Source<A, E>;

  constructor(f: (a: A) => Event<B, E>, source: Source<A, E>) {
    this.f = f;
    this.source = source;
  }

  run(sink: Sink<B, E>, scheduler: Scheduler): Disposable {
    const sd = new SettableDisposable();
    const chainSink = new ChainSink(this.f, sink, scheduler, sd);
    sd.set(this.source.run(chainSink, scheduler));
    return {
      dispose() {
        sd.dispose();
        if (chainSink.innerDisposable !== undefined) {
          chainSink.innerDisposable.dispose();
        }
      },
    };
  }
}

/**
 * Sequentially flatMap: for each value, create an inner Event and
 * concatenate the results.
 *
 * Denotation: `chain(f, e) = concat [f(v) | (t, v) ∈ e]`
 */
export const chain = <A, B, E>(f: (a: A) => Event<B, E>, event: Event<A, E>): Event<B, E> =>
  _createEvent(new ChainSource(f, _getSource(event)));
