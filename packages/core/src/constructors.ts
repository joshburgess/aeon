/**
 * Event constructors.
 *
 * Each constructor creates an Event<A, E> backed by a Source
 * that produces events according to its denotational meaning.
 */

import {
  DURATION_ZERO,
  type Disposable,
  type Duration,
  type Event,
  type Scheduler,
  type Sink,
  type Source,
  type Time,
  timeAdd,
} from "aeon-types"
import { disposeNone } from "./internal/dispose.js"
import { _createEvent } from "./internal/event.js"

// --- Source classes for V8 hidden class stability ---

class EmptySource<A> implements Source<A, never> {
  declare readonly _sync: true

  constructor() {
    this._sync = true
  }

  run(sink: Sink<A, never>, scheduler: Scheduler) {
    sink.end(scheduler.currentTime())
    return disposeNone
  }

  syncIterate(_emit: (value: A) => boolean): void {}
}

class NeverSource<A> implements Source<A, never> {
  run() {
    return disposeNone
  }
}

class NowSource<A> implements Source<A, never> {
  declare readonly value: A
  declare readonly _sync: true

  constructor(value: A) {
    this.value = value
    this._sync = true
  }

  run(sink: Sink<A, never>, scheduler: Scheduler) {
    const t = scheduler.currentTime()
    sink.event(t, this.value)
    sink.end(t)
    return disposeNone
  }

  syncIterate(emit: (value: A) => boolean): void {
    emit(this.value)
  }
}

class ArraySource<A> implements Source<A, never> {
  declare readonly values: readonly A[]
  declare readonly _sync: true

  constructor(values: readonly A[]) {
    this.values = values
    this._sync = true
  }

  run(sink: Sink<A, never>, scheduler: Scheduler) {
    const t = scheduler.currentTime()
    const values = this.values
    for (let i = 0; i < values.length; i++) {
      sink.event(t, values[i]!)
    }
    sink.end(t)
    return disposeNone
  }

  syncIterate(emit: (value: A) => boolean): void {
    const values = this.values
    for (let i = 0; i < values.length; i++) {
      if (!emit(values[i]!)) return
    }
  }
}

// --- Singletons for empty/never ---

const EMPTY_SOURCE = new EmptySource<never>()
const NEVER_SOURCE = new NeverSource<never>()

// --- Internal exports for algebraic simplification ---

/** @internal — used by combinators for instanceof detection */
export { EmptySource as _EmptySource, NowSource as _NowSource, EMPTY_SOURCE as _EMPTY_SOURCE }

// --- Public API ---

/**
 * An Event that ends immediately without emitting any values.
 *
 * Denotation: `[]` — the empty sequence.
 */
export const empty = <A>(): Event<A, never> =>
  _createEvent(EMPTY_SOURCE as unknown as Source<A, never>)

/**
 * An Event that never emits and never ends.
 *
 * Denotation: `_|_` — bottom / divergent.
 */
export const never = <A>(): Event<A, never> =>
  _createEvent(NEVER_SOURCE as unknown as Source<A, never>)

/**
 * An Event that emits a single value at time 0, then ends.
 *
 * Denotation: `[(0, value)]`
 */
export const now = <A>(value: A): Event<A, never> => _createEvent(new NowSource(value))

class AtSource<A> implements Source<A, never> {
  declare readonly time: Time
  declare readonly value: A

  constructor(time: Time, value: A) {
    this.time = time
    this.value = value
  }

  run(sink: Sink<A, never>, scheduler: Scheduler): Disposable {
    const val = this.value
    const delay = ((this.time as number) - (scheduler.currentTime() as number)) as Duration
    return scheduler.scheduleTask(delay, {
      run(t: Time) {
        sink.event(t, val)
        sink.end(t)
      },
      error(t: Time, err: unknown) {
        sink.error(t, err as never)
      },
      dispose() {},
    })
  }
}

/**
 * An Event that emits a single value at a specific time, then ends.
 *
 * Denotation: `[(time, value)]`
 */
export const at = <A>(time: Time, value: A): Event<A, never> =>
  _createEvent(new AtSource(time, value))

/**
 * An Event that emits all values from an array synchronously, then ends.
 *
 * Denotation: `[(t, values[0]), (t, values[1]), ...]` all at the same time.
 */
export const fromArray = <A>(values: readonly A[]): Event<A, never> =>
  _createEvent(new ArraySource(values))

class PeriodicSource implements Source<undefined, never> {
  declare readonly period: Duration

  constructor(period: Duration) {
    this.period = period
  }

  run(sink: Sink<undefined, never>, scheduler: Scheduler): Disposable {
    const period = this.period
    let disposed = false

    const task = {
      run(t: Time) {
        if (!disposed) {
          sink.event(t, undefined)
          scheduler.scheduleTask(period, task)
        }
      },
      error(t: Time, err: unknown) {
        sink.error(t, err as never)
      },
      dispose() {
        disposed = true
      },
    }

    const st = scheduler.scheduleTask(period, task)
    return {
      dispose() {
        disposed = true
        st.dispose()
      },
    }
  }
}

/**
 * An Event that emits undefined at regular intervals.
 *
 * Denotation: `[(period, undefined), (2*period, undefined), ...]`
 */
export const periodic = (period: Duration): Event<undefined, never> =>
  _createEvent(new PeriodicSource(period))

class RangeSource implements Source<number, never> {
  declare readonly start: number
  declare readonly count: number
  declare readonly _sync: true

  constructor(start: number, count: number) {
    this.start = start
    this.count = count
    this._sync = true
  }

  run(sink: Sink<number, never>, scheduler: Scheduler): Disposable {
    const t = scheduler.currentTime()
    const end = this.start + this.count
    for (let i = this.start; i < end; i++) {
      sink.event(t, i)
    }
    sink.end(t)
    return disposeNone
  }

  syncIterate(emit: (value: number) => boolean): void {
    const end = this.start + this.count
    for (let i = this.start; i < end; i++) {
      if (!emit(i)) return
    }
  }
}

/**
 * An Event that emits a sequence of numbers synchronously, then ends.
 *
 * Denotation: `[(t, start), (t, start+1), ..., (t, start+count-1)]`
 */
export const range = (start: number, count: number): Event<number, never> =>
  _createEvent(new RangeSource(start, Math.max(0, count)))

class IterableSource<A> implements Source<A, never> {
  declare readonly iterable: Iterable<A>
  declare readonly _sync: true

  constructor(iterable: Iterable<A>) {
    this.iterable = iterable
    this._sync = true
  }

  run(sink: Sink<A, never>, scheduler: Scheduler): Disposable {
    const t = scheduler.currentTime()
    for (const value of this.iterable) {
      sink.event(t, value)
    }
    sink.end(t)
    return disposeNone
  }

  syncIterate(emit: (value: A) => boolean): void {
    for (const value of this.iterable) {
      if (!emit(value)) return
    }
  }
}

/**
 * Create an Event from an iterable, emitting all values synchronously.
 *
 * Denotation: `[(t, v) for v in iterable]` all at the same time.
 */
export const fromIterable = <A>(iterable: Iterable<A>): Event<A, never> =>
  _createEvent(new IterableSource(iterable))
