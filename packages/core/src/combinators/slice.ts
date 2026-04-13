/**
 * Slicing combinators: take, drop, takeWhile, dropWhile, slice.
 *
 * Includes algebraic simplifications:
 * - take(n, take(m, s)) → take(min(n, m), s)
 * - drop(n, drop(m, s)) → drop(n + m, s)
 * - take/drop on empty → empty
 */

import type { Disposable, Event, Scheduler, Sink, Source, Time } from "aeon-types"
import { _EMPTY_SOURCE, _EmptySource } from "../constructors.js"
import { Pipe } from "../internal/Pipe.js"
import { SettableDisposable, disposeAll, disposeNone } from "../internal/dispose.js"
import { type SyncSource, _createEvent, _getSource } from "../internal/event.js"

// --- take ---

class TakeSink<A, E> extends Pipe<A, E> {
  declare readonly disposable: SettableDisposable
  declare remaining: number

  constructor(n: number, sink: Sink<A, E>, disposable: SettableDisposable) {
    super(sink)
    this.remaining = n
    this.disposable = disposable
  }

  event(time: Time, value: A): void {
    if (this.remaining <= 0) return
    this.remaining--
    this.sink.event(time, value)
    if (this.remaining === 0) {
      this.disposable.dispose()
      this.sink.end(time)
    }
  }
}

class TakeSource<A, E> implements Source<A, E> {
  declare readonly n: number
  declare readonly source: Source<A, E>
  declare readonly _sync: boolean

  constructor(n: number, source: Source<A, E>) {
    this.n = n
    this.source = source
    this._sync = (source as SyncSource<A, E>)._sync === true
  }

  run(sink: Sink<A, E>, scheduler: Scheduler): Disposable {
    const sd = new SettableDisposable()
    sd.set(this.source.run(new TakeSink(this.n, sink, sd), scheduler))
    return sd
  }

  syncIterate(emit: (value: A) => boolean): void {
    let remaining = this.n
    ;(this.source as SyncSource<A, E>).syncIterate((v: A) => {
      if (remaining <= 0) return false
      remaining--
      return emit(v) && remaining > 0
    })
  }
}

class EmptySliceSource<A, E> implements Source<A, E> {
  declare readonly _sync: true

  constructor() {
    this._sync = true
  }

  run(sink: Sink<A, E>, scheduler: Scheduler): Disposable {
    sink.end(scheduler.currentTime())
    return disposeNone
  }

  syncIterate(_emit: (value: A) => boolean): void {}
}

const EMPTY_SLICE = new EmptySliceSource<never, never>()

/** Take the first n values from the stream, then end. */
export const take = <A, E>(n: number, event: Event<A, E>): Event<A, E> => {
  if (n <= 0) {
    return _createEvent(EMPTY_SLICE as unknown as Source<A, E>)
  }
  const source = _getSource(event)

  // take(n, empty()) → empty()
  if (source instanceof _EmptySource) {
    return _createEvent(_EMPTY_SOURCE as unknown as Source<A, E>)
  }

  // take(n, take(m, s)) → take(min(n, m), s)
  if (source instanceof TakeSource) {
    return _createEvent(new TakeSource(Math.min(n, source.n), source.source))
  }

  return _createEvent(new TakeSource(n, source))
}

// --- drop ---

class DropSink<A, E> extends Pipe<A, E> {
  declare remaining: number

  constructor(n: number, sink: Sink<A, E>) {
    super(sink)
    this.remaining = n
  }

  event(time: Time, value: A): void {
    if (this.remaining > 0) {
      this.remaining--
    } else {
      this.sink.event(time, value)
    }
  }
}

class DropSource<A, E> implements Source<A, E> {
  declare readonly n: number
  declare readonly source: Source<A, E>
  declare readonly _sync: boolean

  constructor(n: number, source: Source<A, E>) {
    this.n = n
    this.source = source
    this._sync = (source as SyncSource<A, E>)._sync === true
  }

  run(sink: Sink<A, E>, scheduler: Scheduler): Disposable {
    return this.source.run(new DropSink(this.n, sink), scheduler)
  }

  syncIterate(emit: (value: A) => boolean): void {
    let remaining = this.n
    ;(this.source as SyncSource<A, E>).syncIterate((v: A) => {
      if (remaining > 0) {
        remaining--
        return true
      }
      return emit(v)
    })
  }
}

/** Drop the first n values, then pass through the rest. */
export const drop = <A, E>(n: number, event: Event<A, E>): Event<A, E> => {
  if (n <= 0) return event
  const source = _getSource(event)

  // drop(n, empty()) → empty()
  if (source instanceof _EmptySource) {
    return _createEvent(_EMPTY_SOURCE as unknown as Source<A, E>)
  }

  // drop(n, drop(m, s)) → drop(n + m, s)
  if (source instanceof DropSource) {
    return _createEvent(new DropSource(n + source.n, source.source))
  }

  return _createEvent(new DropSource(n, source))
}

// --- takeWhile ---

class TakeWhileSink<A, E> extends Pipe<A, E> {
  declare readonly predicate: (a: A) => boolean
  declare readonly disposable: SettableDisposable
  declare active: boolean

  constructor(predicate: (a: A) => boolean, sink: Sink<A, E>, disposable: SettableDisposable) {
    super(sink)
    this.predicate = predicate
    this.disposable = disposable
    this.active = true
  }

  event(time: Time, value: A): void {
    if (!this.active) return
    const p = this.predicate
    if (p(value)) {
      this.sink.event(time, value)
    } else {
      this.active = false
      this.disposable.dispose()
      this.sink.end(time)
    }
  }
}

class TakeWhileSource<A, E> implements Source<A, E> {
  declare readonly predicate: (a: A) => boolean
  declare readonly source: Source<A, E>

  constructor(predicate: (a: A) => boolean, source: Source<A, E>) {
    this.predicate = predicate
    this.source = source
  }

  run(sink: Sink<A, E>, scheduler: Scheduler): Disposable {
    const sd = new SettableDisposable()
    sd.set(this.source.run(new TakeWhileSink(this.predicate, sink, sd), scheduler))
    return sd
  }
}

/** Take values while the predicate holds, then end. */
export const takeWhile = <A, E>(predicate: (a: A) => boolean, event: Event<A, E>): Event<A, E> =>
  _createEvent(new TakeWhileSource(predicate, _getSource(event)))

// --- dropWhile ---

class DropWhileSink<A, E> extends Pipe<A, E> {
  declare readonly predicate: (a: A) => boolean
  declare skipping: boolean

  constructor(predicate: (a: A) => boolean, sink: Sink<A, E>) {
    super(sink)
    this.predicate = predicate
    this.skipping = true
  }

  event(time: Time, value: A): void {
    if (this.skipping) {
      const p = this.predicate
      if (p(value)) return
      this.skipping = false
    }
    this.sink.event(time, value)
  }
}

class DropWhileSource<A, E> implements Source<A, E> {
  declare readonly predicate: (a: A) => boolean
  declare readonly source: Source<A, E>

  constructor(predicate: (a: A) => boolean, source: Source<A, E>) {
    this.predicate = predicate
    this.source = source
  }

  run(sink: Sink<A, E>, scheduler: Scheduler): Disposable {
    return this.source.run(new DropWhileSink(this.predicate, sink), scheduler)
  }
}

/** Drop values while the predicate holds, then pass through the rest. */
export const dropWhile = <A, E>(predicate: (a: A) => boolean, event: Event<A, E>): Event<A, E> =>
  _createEvent(new DropWhileSource(predicate, _getSource(event)))

// --- slice ---

/**
 * Take a contiguous slice: drop `start` values, then take `end - start`.
 *
 * Denotation: `slice(s, e, stream) = take(e - s, drop(s, stream))`
 */
export const slice = <A, E>(start: number, end: number, event: Event<A, E>): Event<A, E> =>
  take(end - start, drop(start, event))

// --- until ---

class UntilSink<A, E> extends Pipe<A, E> {
  declare readonly disposable: SettableDisposable
  declare active: boolean

  constructor(sink: Sink<A, E>, disposable: SettableDisposable) {
    super(sink)
    this.disposable = disposable
    this.active = true
  }

  event(time: Time, value: A): void {
    if (this.active) {
      this.sink.event(time, value)
    }
  }
}

class UntilSignalSink<A, E> {
  declare readonly mainSink: UntilSink<A, E>
  declare readonly disposable: SettableDisposable

  constructor(mainSink: UntilSink<A, E>, disposable: SettableDisposable) {
    this.mainSink = mainSink
    this.disposable = disposable
  }

  event(time: Time, _value: unknown): void {
    if (this.mainSink.active) {
      this.mainSink.active = false
      this.disposable.dispose()
      this.mainSink.sink.end(time)
    }
  }

  error(time: Time, err: E): void {
    this.mainSink.sink.error(time, err)
  }

  end(_time: Time): void {
    // Signal ending without firing means: keep going until main ends naturally
  }
}

class UntilSource<A, E> implements Source<A, E> {
  declare readonly signal: Source<unknown, E>
  declare readonly source: Source<A, E>

  constructor(signal: Source<unknown, E>, source: Source<A, E>) {
    this.signal = signal
    this.source = source
  }

  run(sink: Sink<A, E>, scheduler: Scheduler): Disposable {
    const sd = new SettableDisposable()
    const mainSink = new UntilSink<A, E>(sink, sd)
    const signalDisposable = this.signal.run(
      new UntilSignalSink<A, E>(mainSink, sd) as unknown as Sink<unknown, E>,
      scheduler,
    )
    const mainDisposable = this.source.run(mainSink, scheduler)
    sd.set(disposeAll([mainDisposable, signalDisposable]))
    return sd
  }
}

/**
 * Take values from the event until the signal fires, then end.
 *
 * Denotation: `until(signal, e) = [(t, v) | (t, v) ∈ e, t < t_signal]`
 * where `t_signal` is the time of the first occurrence in `signal`.
 */
export const until = <A, E>(signal: Event<unknown, E>, event: Event<A, E>): Event<A, E> =>
  _createEvent(new UntilSource(_getSource(signal), _getSource(event)))

// --- since ---

class SinceSink<A, E> extends Pipe<A, E> {
  declare open: boolean

  constructor(sink: Sink<A, E>) {
    super(sink)
    this.open = false
  }

  event(time: Time, value: A): void {
    if (this.open) {
      this.sink.event(time, value)
    }
  }
}

class SinceSignalSink<A, E> {
  declare readonly mainSink: SinceSink<A, E>

  constructor(mainSink: SinceSink<A, E>) {
    this.mainSink = mainSink
  }

  event(_time: Time, _value: unknown): void {
    this.mainSink.open = true
  }

  error(time: Time, err: E): void {
    this.mainSink.sink.error(time, err)
  }

  end(_time: Time): void {
    // Signal ending without firing means: never open
  }
}

class SinceSource<A, E> implements Source<A, E> {
  declare readonly signal: Source<unknown, E>
  declare readonly source: Source<A, E>

  constructor(signal: Source<unknown, E>, source: Source<A, E>) {
    this.signal = signal
    this.source = source
  }

  run(sink: Sink<A, E>, scheduler: Scheduler): Disposable {
    const mainSink = new SinceSink<A, E>(sink)
    const signalDisposable = this.signal.run(
      new SinceSignalSink<A, E>(mainSink) as unknown as Sink<unknown, E>,
      scheduler,
    )
    const mainDisposable = this.source.run(mainSink, scheduler)
    return disposeAll([mainDisposable, signalDisposable])
  }
}

/**
 * Drop values from the event until the signal fires, then pass through the rest.
 *
 * Denotation: `since(signal, e) = [(t, v) | (t, v) ∈ e, t >= t_signal]`
 * where `t_signal` is the time of the first occurrence in `signal`.
 */
export const since = <A, E>(signal: Event<unknown, E>, event: Event<A, E>): Event<A, E> =>
  _createEvent(new SinceSource(_getSource(signal), _getSource(event)))
