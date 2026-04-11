/**
 * combine and zip combinators.
 *
 * combine: emits whenever either source emits, using the latest value from each.
 * zip: emits pairwise — only when both sources have emitted a new value.
 *
 * Uses monomorphic Sink/Source classes for V8 hidden class stability.
 */

import type { Disposable, Event, Scheduler, Sink, Source, Time } from "@pulse/types";
import { disposeAll } from "../internal/dispose.js";
import { _createEvent, _getSource } from "../internal/event.js";

// --- combine ---

class CombineState<A, B, C, E> {
  declare latestA: A | undefined;
  declare latestB: B | undefined;
  declare hasA: boolean;
  declare hasB: boolean;
  declare endCount: number;
  declare readonly sink: Sink<C, E>;
  declare readonly f: (a: A, b: B) => C;

  constructor(f: (a: A, b: B) => C, sink: Sink<C, E>) {
    this.latestA = undefined;
    this.latestB = undefined;
    this.hasA = false;
    this.hasB = false;
    this.endCount = 0;
    this.sink = sink;
    this.f = f;
  }

  emit(time: Time): void {
    if (this.hasA && this.hasB) {
      const f = this.f;
      this.sink.event(time, f(this.latestA as A, this.latestB as B));
    }
  }

  tryEnd(time: Time): void {
    this.endCount++;
    if (this.endCount === 2) this.sink.end(time);
  }
}

class CombineSinkA<A, B, C, E> implements Sink<A, E> {
  declare readonly state: CombineState<A, B, C, E>;

  constructor(state: CombineState<A, B, C, E>) {
    this.state = state;
  }

  event(time: Time, value: A): void {
    this.state.latestA = value;
    this.state.hasA = true;
    this.state.emit(time);
  }

  error(time: Time, err: E): void {
    this.state.sink.error(time, err);
  }

  end(time: Time): void {
    this.state.tryEnd(time);
  }
}

class CombineSinkB<A, B, C, E> implements Sink<B, E> {
  declare readonly state: CombineState<A, B, C, E>;

  constructor(state: CombineState<A, B, C, E>) {
    this.state = state;
  }

  event(time: Time, value: B): void {
    this.state.latestB = value;
    this.state.hasB = true;
    this.state.emit(time);
  }

  error(time: Time, err: E): void {
    this.state.sink.error(time, err);
  }

  end(time: Time): void {
    this.state.tryEnd(time);
  }
}

class CombineSource<A, B, C, E> implements Source<C, E> {
  declare readonly f: (a: A, b: B) => C;
  declare readonly sourceA: Source<A, E>;
  declare readonly sourceB: Source<B, E>;

  constructor(f: (a: A, b: B) => C, sourceA: Source<A, E>, sourceB: Source<B, E>) {
    this.f = f;
    this.sourceA = sourceA;
    this.sourceB = sourceB;
  }

  run(sink: Sink<C, E>, scheduler: Scheduler): Disposable {
    const state = new CombineState<A, B, C, E>(this.f, sink);
    return disposeAll([
      this.sourceA.run(new CombineSinkA(state), scheduler),
      this.sourceB.run(new CombineSinkB(state), scheduler),
    ]);
  }
}

/**
 * Combine two event streams using a function, emitting whenever either source emits.
 *
 * Denotation: emits f(latestA, latestB) at each time where either A or B fires,
 * once both have produced at least one value.
 */
export const combine = <A, B, C, E>(
  f: (a: A, b: B) => C,
  ea: Event<A, E>,
  eb: Event<B, E>,
): Event<C, E> =>
  _createEvent(new CombineSource(f, _getSource(ea), _getSource(eb)));

// --- zip ---

class ZipState<A, B, E> {
  declare readonly bufferA: A[];
  declare readonly bufferB: B[];
  declare endCount: number;
  declare readonly sink: Sink<[A, B], E>;

  constructor(sink: Sink<[A, B], E>) {
    this.bufferA = [];
    this.bufferB = [];
    this.endCount = 0;
    this.sink = sink;
  }

  tryEmit(time: Time): void {
    const bufA = this.bufferA;
    const bufB = this.bufferB;
    while (bufA.length > 0 && bufB.length > 0) {
      this.sink.event(time, [bufA.shift()!, bufB.shift()!]);
    }
  }

  tryEnd(time: Time): void {
    this.endCount++;
    if (this.endCount === 2) {
      this.sink.end(time);
    }
  }
}

class ZipSinkA<A, B, E> implements Sink<A, E> {
  declare readonly state: ZipState<A, B, E>;

  constructor(state: ZipState<A, B, E>) {
    this.state = state;
  }

  event(time: Time, value: A): void {
    this.state.bufferA.push(value);
    this.state.tryEmit(time);
  }

  error(time: Time, err: E): void {
    this.state.sink.error(time, err);
  }

  end(time: Time): void {
    this.state.tryEnd(time);
  }
}

class ZipSinkB<A, B, E> implements Sink<B, E> {
  declare readonly state: ZipState<A, B, E>;

  constructor(state: ZipState<A, B, E>) {
    this.state = state;
  }

  event(time: Time, value: B): void {
    this.state.bufferB.push(value);
    this.state.tryEmit(time);
  }

  error(time: Time, err: E): void {
    this.state.sink.error(time, err);
  }

  end(time: Time): void {
    this.state.tryEnd(time);
  }
}

class ZipSource<A, B, E> implements Source<[A, B], E> {
  declare readonly sourceA: Source<A, E>;
  declare readonly sourceB: Source<B, E>;

  constructor(sourceA: Source<A, E>, sourceB: Source<B, E>) {
    this.sourceA = sourceA;
    this.sourceB = sourceB;
  }

  run(sink: Sink<[A, B], E>, scheduler: Scheduler): Disposable {
    const state = new ZipState<A, B, E>(sink);
    return disposeAll([
      this.sourceA.run(new ZipSinkA(state), scheduler),
      this.sourceB.run(new ZipSinkB(state), scheduler),
    ]);
  }
}

/**
 * Zip two event streams pairwise.
 *
 * Denotation: `zip(ea, eb) = [(t, [a, b]) | (ta, a) ∈ ea, (tb, b) ∈ eb]`
 * where pairs are consumed in order, t = max(ta, tb).
 */
export const zip = <A, B, E>(ea: Event<A, E>, eb: Event<B, E>): Event<[A, B], E> =>
  _createEvent(new ZipSource(_getSource(ea), _getSource(eb)));
