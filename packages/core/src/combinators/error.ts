/**
 * Error handling combinators with typed error channel.
 *
 * The E type parameter transforms through these operations — this is
 * the key advantage over untyped error handling.
 *
 * Uses monomorphic Sink/Source classes for V8 hidden class stability.
 */

import type { Disposable, Event, Scheduler, Sink, Source, Time } from "aeon-types"
import { SettableDisposable, disposeNone } from "../internal/dispose.js"
import { _createEvent, _getSource } from "../internal/event.js"

// --- catchError ---

class CatchSink<A, E1, E2> implements Sink<A, E1> {
  declare readonly sink: Sink<A, E2>
  declare readonly handler: (err: E1) => Event<A, E2>
  declare readonly scheduler: Scheduler
  declare readonly disposable: SettableDisposable

  constructor(
    handler: (err: E1) => Event<A, E2>,
    sink: Sink<A, E2>,
    scheduler: Scheduler,
    disposable: SettableDisposable,
  ) {
    this.handler = handler
    this.sink = sink
    this.scheduler = scheduler
    this.disposable = disposable
  }

  event(time: Time, value: A): void {
    this.sink.event(time, value)
  }

  error(_time: Time, err: E1): void {
    const handler = this.handler
    const recovery = handler(err)
    this.disposable.set(_getSource(recovery).run(this.sink, this.scheduler))
  }

  end(time: Time): void {
    this.sink.end(time)
  }
}

class CatchSource<A, E1, E2> implements Source<A, E2> {
  declare readonly handler: (err: E1) => Event<A, E2>
  declare readonly source: Source<A, E1>

  constructor(handler: (err: E1) => Event<A, E2>, source: Source<A, E1>) {
    this.handler = handler
    this.source = source
  }

  run(sink: Sink<A, E2>, scheduler: Scheduler): Disposable {
    const sd = new SettableDisposable()
    sd.set(this.source.run(new CatchSink(this.handler, sink, scheduler, sd), scheduler))
    return sd
  }
}

/**
 * Recover from errors by switching to a new Event stream.
 * The error type CHANGES from E1 to E2.
 *
 * Denotation: if the stream errors with `e`, continue with `handler(e)`.
 */
export const catchError = <A, E1, E2>(
  handler: (err: E1) => Event<A, E2>,
  event: Event<A, E1>,
): Event<A, E2> => _createEvent(new CatchSource(handler, _getSource(event)))

// --- mapError ---

class MapErrorSink<A, E1, E2> implements Sink<A, E1> {
  declare readonly sink: Sink<A, E2>
  declare readonly f: (err: E1) => E2

  constructor(f: (err: E1) => E2, sink: Sink<A, E2>) {
    this.f = f
    this.sink = sink
  }

  event(time: Time, value: A): void {
    this.sink.event(time, value)
  }

  error(time: Time, err: E1): void {
    const f = this.f
    this.sink.error(time, f(err))
  }

  end(time: Time): void {
    this.sink.end(time)
  }
}

class MapErrorSource<A, E1, E2> implements Source<A, E2> {
  declare readonly f: (err: E1) => E2
  declare readonly source: Source<A, E1>

  constructor(f: (err: E1) => E2, source: Source<A, E1>) {
    this.f = f
    this.source = source
  }

  run(sink: Sink<A, E2>, scheduler: Scheduler): Disposable {
    return this.source.run(new MapErrorSink(this.f, sink), scheduler)
  }
}

/**
 * Transform the error value without changing the stream structure.
 *
 * Denotation: `mapError(f, e)` — the error, if any, is replaced by `f(err)`.
 */
export const mapError = <A, E1, E2>(f: (err: E1) => E2, event: Event<A, E1>): Event<A, E2> =>
  _createEvent(new MapErrorSource(f, _getSource(event)))

// --- throwError ---

class ThrowErrorSource<A, E> implements Source<A, E> {
  declare readonly err: E

  constructor(err: E) {
    this.err = err
  }

  run(sink: Sink<A, E>, scheduler: Scheduler): Disposable {
    sink.error(scheduler.currentTime(), this.err)
    return disposeNone
  }
}

/**
 * An Event that immediately errors with the given value.
 *
 * Denotation: `Error(err)` — a failed event sequence.
 */
export const throwError = <A, E>(err: E): Event<A, E> => _createEvent(new ThrowErrorSource(err))
