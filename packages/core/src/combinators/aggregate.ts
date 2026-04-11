/**
 * Aggregate combinators: count, every, elementAt.
 *
 * Simple stream aggregation operators that can be composed from
 * primitives but are common enough to justify named combinators.
 */

import type { Disposable, Event, Scheduler, Sink, Source, Time } from "@pulse/types";
import { Pipe } from "../internal/Pipe.js";
import { SettableDisposable } from "../internal/dispose.js";
import { _createEvent, _getSource } from "../internal/event.js";

// --- count ---

class CountSink<A, E> implements Sink<A, E> {
  declare readonly sink: Sink<number, E>;
  declare n: number;

  constructor(sink: Sink<number, E>) {
    this.sink = sink;
    this.n = 0;
  }

  event(_time: Time, _value: A): void {
    this.n++;
  }

  error(time: Time, err: E): void {
    this.sink.error(time, err);
  }

  end(time: Time): void {
    this.sink.event(time, this.n);
    this.sink.end(time);
  }
}

class CountSource<A, E> implements Source<number, E> {
  declare readonly source: Source<A, E>;

  constructor(source: Source<A, E>) {
    this.source = source;
  }

  run(sink: Sink<number, E>, scheduler: Scheduler): Disposable {
    return this.source.run(new CountSink(sink) as unknown as Sink<A, E>, scheduler);
  }
}

/**
 * Emit the total number of values when the stream ends.
 *
 * Denotation: `count(e) = [(t_end, |e|)]`
 */
export const count = <A, E>(event: Event<A, E>): Event<number, E> =>
  _createEvent(new CountSource(_getSource(event)));

// --- every ---

class EverySink<A, E> extends Pipe<boolean, E> {
  declare readonly predicate: (a: A) => boolean;
  declare result: boolean;

  constructor(predicate: (a: A) => boolean, sink: Sink<boolean, E>) {
    super(sink);
    this.predicate = predicate;
    this.result = true;
  }

  event(time: Time, value: unknown): void {
    if (!this.result) return;
    if (!this.predicate(value as A)) {
      this.result = false;
      this.sink.event(time, false);
      this.sink.end(time);
    }
  }

  end(time: Time): void {
    if (this.result) {
      this.sink.event(time, true);
    }
    this.sink.end(time);
  }
}

class EverySource<A, E> implements Source<boolean, E> {
  declare readonly predicate: (a: A) => boolean;
  declare readonly source: Source<A, E>;

  constructor(predicate: (a: A) => boolean, source: Source<A, E>) {
    this.predicate = predicate;
    this.source = source;
  }

  run(sink: Sink<boolean, E>, scheduler: Scheduler): Disposable {
    return this.source.run(new EverySink(this.predicate, sink) as unknown as Sink<A, E>, scheduler);
  }
}

/**
 * Emit `true` when the stream ends if all values matched the predicate,
 * or `false` as soon as one fails.
 *
 * Denotation: `every(p, e) = [(t, ∀v ∈ e. p(v))]`
 */
export const every = <A, E>(predicate: (a: A) => boolean, event: Event<A, E>): Event<boolean, E> =>
  _createEvent(new EverySource(predicate, _getSource(event)));

// --- elementAt ---

class ElementAtSink<A, E> extends Pipe<A, E> {
  declare readonly n: number;
  declare readonly disposable: SettableDisposable;
  declare index: number;
  declare found: boolean;

  constructor(n: number, sink: Sink<A, E>, disposable: SettableDisposable) {
    super(sink);
    this.n = n;
    this.disposable = disposable;
    this.index = 0;
    this.found = false;
  }

  event(time: Time, value: A): void {
    if (this.found) return;
    if (this.index === this.n) {
      this.found = true;
      this.sink.event(time, value);
      this.disposable.dispose();
      this.sink.end(time);
    }
    this.index++;
  }

  end(time: Time): void {
    if (!this.found) {
      this.sink.end(time);
    }
  }
}

class ElementAtSource<A, E> implements Source<A, E> {
  declare readonly n: number;
  declare readonly source: Source<A, E>;

  constructor(n: number, source: Source<A, E>) {
    this.n = n;
    this.source = source;
  }

  run(sink: Sink<A, E>, scheduler: Scheduler): Disposable {
    const sd = new SettableDisposable();
    sd.set(this.source.run(new ElementAtSink(this.n, sink, sd), scheduler));
    return sd;
  }
}

/**
 * Emit only the nth value (0-indexed), then end.
 *
 * Denotation: `elementAt(n, e) = [e[n]]` if it exists, empty otherwise.
 */
export const elementAt = <A, E>(n: number, event: Event<A, E>): Event<A, E> =>
  _createEvent(new ElementAtSource(n, _getSource(event)));
