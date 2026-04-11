/**
 * Slicing combinators: take, skip, takeWhile, skipWhile, slice.
 *
 * Includes algebraic simplifications:
 * - take(n, take(m, s)) → take(min(n, m), s)
 * - skip(n, skip(m, s)) → skip(n + m, s)
 * - take/skip on empty → empty
 */

import type { Disposable, Event, Scheduler, Sink, Source, Time } from "@pulse/types";
import { _EmptySource, _EMPTY_SOURCE } from "../constructors.js";
import { SettableDisposable, disposeNone } from "../internal/dispose.js";
import { _createEvent, _getSource } from "../internal/event.js";
import { Pipe } from "../internal/Pipe.js";

// --- take ---

class TakeSink<A, E> extends Pipe<A, E> {
  declare readonly disposable: SettableDisposable;
  declare remaining: number;

  constructor(n: number, sink: Sink<A, E>, disposable: SettableDisposable) {
    super(sink);
    this.remaining = n;
    this.disposable = disposable;
  }

  event(time: Time, value: A): void {
    if (this.remaining <= 0) return;
    this.remaining--;
    this.sink.event(time, value);
    if (this.remaining === 0) {
      this.disposable.dispose();
      this.sink.end(time);
    }
  }
}

class TakeSource<A, E> implements Source<A, E> {
  declare readonly n: number;
  declare readonly source: Source<A, E>;
  declare readonly _sync: boolean;

  constructor(n: number, source: Source<A, E>) {
    this.n = n;
    this.source = source;
    this._sync = (source as any)._sync === true;
  }

  run(sink: Sink<A, E>, scheduler: Scheduler): Disposable {
    const sd = new SettableDisposable();
    sd.set(this.source.run(new TakeSink(this.n, sink, sd), scheduler));
    return sd;
  }

  syncIterate(emit: (value: A) => boolean): void {
    let remaining = this.n;
    (this.source as any).syncIterate((v: A) => {
      if (remaining <= 0) return false;
      remaining--;
      return emit(v) && remaining > 0;
    });
  }
}

class EmptySliceSource<A, E> implements Source<A, E> {
  declare readonly _sync: true;

  constructor() {
    this._sync = true;
  }

  run(sink: Sink<A, E>, scheduler: Scheduler): Disposable {
    sink.end(scheduler.currentTime());
    return disposeNone;
  }

  syncIterate(_emit: (value: A) => boolean): void {}
}

const EMPTY_SLICE = new EmptySliceSource<never, never>();

/** Take the first n values from the stream, then end. */
export const take = <A, E>(n: number, event: Event<A, E>): Event<A, E> => {
  if (n <= 0) {
    return _createEvent(EMPTY_SLICE as unknown as Source<A, E>);
  }
  const source = _getSource(event);

  // take(n, empty()) → empty()
  if (source instanceof _EmptySource) {
    return _createEvent(_EMPTY_SOURCE as unknown as Source<A, E>);
  }

  // take(n, take(m, s)) → take(min(n, m), s)
  if (source instanceof TakeSource) {
    return _createEvent(new TakeSource(Math.min(n, source.n), source.source));
  }

  return _createEvent(new TakeSource(n, source));
};

// --- skip ---

class SkipSink<A, E> extends Pipe<A, E> {
  declare remaining: number;

  constructor(n: number, sink: Sink<A, E>) {
    super(sink);
    this.remaining = n;
  }

  event(time: Time, value: A): void {
    if (this.remaining > 0) {
      this.remaining--;
    } else {
      this.sink.event(time, value);
    }
  }
}

class SkipSource<A, E> implements Source<A, E> {
  declare readonly n: number;
  declare readonly source: Source<A, E>;
  declare readonly _sync: boolean;

  constructor(n: number, source: Source<A, E>) {
    this.n = n;
    this.source = source;
    this._sync = (source as any)._sync === true;
  }

  run(sink: Sink<A, E>, scheduler: Scheduler): Disposable {
    return this.source.run(new SkipSink(this.n, sink), scheduler);
  }

  syncIterate(emit: (value: A) => boolean): void {
    let remaining = this.n;
    (this.source as any).syncIterate((v: A) => {
      if (remaining > 0) {
        remaining--;
        return true;
      }
      return emit(v);
    });
  }
}

/** Skip the first n values, then pass through the rest. */
export const skip = <A, E>(n: number, event: Event<A, E>): Event<A, E> => {
  if (n <= 0) return event;
  const source = _getSource(event);

  // skip(n, empty()) → empty()
  if (source instanceof _EmptySource) {
    return _createEvent(_EMPTY_SOURCE as unknown as Source<A, E>);
  }

  // skip(n, skip(m, s)) → skip(n + m, s)
  if (source instanceof SkipSource) {
    return _createEvent(new SkipSource(n + source.n, source.source));
  }

  return _createEvent(new SkipSource(n, source));
};

// --- takeWhile ---

class TakeWhileSink<A, E> extends Pipe<A, E> {
  declare readonly predicate: (a: A) => boolean;
  declare readonly disposable: SettableDisposable;
  declare active: boolean;

  constructor(predicate: (a: A) => boolean, sink: Sink<A, E>, disposable: SettableDisposable) {
    super(sink);
    this.predicate = predicate;
    this.disposable = disposable;
    this.active = true;
  }

  event(time: Time, value: A): void {
    if (!this.active) return;
    const p = this.predicate;
    if (p(value)) {
      this.sink.event(time, value);
    } else {
      this.active = false;
      this.disposable.dispose();
      this.sink.end(time);
    }
  }
}

class TakeWhileSource<A, E> implements Source<A, E> {
  declare readonly predicate: (a: A) => boolean;
  declare readonly source: Source<A, E>;

  constructor(predicate: (a: A) => boolean, source: Source<A, E>) {
    this.predicate = predicate;
    this.source = source;
  }

  run(sink: Sink<A, E>, scheduler: Scheduler): Disposable {
    const sd = new SettableDisposable();
    sd.set(this.source.run(new TakeWhileSink(this.predicate, sink, sd), scheduler));
    return sd;
  }
}

/** Take values while the predicate holds, then end. */
export const takeWhile = <A, E>(predicate: (a: A) => boolean, event: Event<A, E>): Event<A, E> =>
  _createEvent(new TakeWhileSource(predicate, _getSource(event)));

// --- skipWhile ---

class SkipWhileSink<A, E> extends Pipe<A, E> {
  declare readonly predicate: (a: A) => boolean;
  declare skipping: boolean;

  constructor(predicate: (a: A) => boolean, sink: Sink<A, E>) {
    super(sink);
    this.predicate = predicate;
    this.skipping = true;
  }

  event(time: Time, value: A): void {
    if (this.skipping) {
      const p = this.predicate;
      if (p(value)) return;
      this.skipping = false;
    }
    this.sink.event(time, value);
  }
}

class SkipWhileSource<A, E> implements Source<A, E> {
  declare readonly predicate: (a: A) => boolean;
  declare readonly source: Source<A, E>;

  constructor(predicate: (a: A) => boolean, source: Source<A, E>) {
    this.predicate = predicate;
    this.source = source;
  }

  run(sink: Sink<A, E>, scheduler: Scheduler): Disposable {
    return this.source.run(new SkipWhileSink(this.predicate, sink), scheduler);
  }
}

/** Skip values while the predicate holds, then pass through the rest. */
export const skipWhile = <A, E>(predicate: (a: A) => boolean, event: Event<A, E>): Event<A, E> =>
  _createEvent(new SkipWhileSource(predicate, _getSource(event)));

// --- slice ---

/**
 * Take a contiguous slice: skip `start` values, then take `end - start`.
 *
 * Denotation: `slice(s, e, stream) = take(e - s, skip(s, stream))`
 */
export const slice = <A, E>(start: number, end: number, event: Event<A, E>): Event<A, E> =>
  take(end - start, skip(start, event));
