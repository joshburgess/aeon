/**
 * mergeMap combinator.
 *
 * Maps each value to an inner Event and merges the results, with
 * bounded concurrency.
 *
 * Uses monomorphic Sink/Source classes for V8 hidden class stability.
 */

import type { Disposable, Event, Scheduler, Sink, Source, Time } from "aeon-types"
import { _createEvent, _getSource } from "../internal/event.js"

class MergeMapInnerSink<B, E> implements Sink<B, E> {
  declare readonly state: MergeMapState<unknown, B, E>

  constructor(state: MergeMapState<unknown, B, E>) {
    this.state = state
  }

  event(time: Time, value: B): void {
    if (!this.state.disposed) this.state.sink.event(time, value)
  }

  error(time: Time, err: E): void {
    if (!this.state.disposed) this.state.sink.error(time, err)
  }

  end(time: Time): void {
    this.state.active--
    if (this.state.buffer.length > 0) {
      this.state.tryStart()
    } else if (this.state.outerEnded && this.state.active === 0) {
      this.state.sink.end(time)
    }
  }
}

class MergeMapOuterSink<A, B, E> implements Sink<A, E> {
  declare readonly state: MergeMapState<A, B, E>

  constructor(state: MergeMapState<A, B, E>) {
    this.state = state
  }

  event(_time: Time, value: A): void {
    this.state.buffer.push(value)
    this.state.tryStart()
  }

  error(time: Time, err: E): void {
    this.state.sink.error(time, err)
  }

  end(time: Time): void {
    this.state.outerEnded = true
    if (this.state.active === 0 && this.state.buffer.length === 0) {
      this.state.sink.end(time)
    }
  }
}

class MergeMapState<A, B, E> {
  declare readonly sink: Sink<B, E>
  declare readonly f: (a: A) => Event<B, E>
  declare readonly concurrency: number
  declare readonly scheduler: Scheduler
  declare readonly buffer: A[]
  declare readonly innerDisposables: Disposable[]
  declare active: number
  declare outerEnded: boolean
  declare disposed: boolean

  constructor(
    f: (a: A) => Event<B, E>,
    concurrency: number,
    sink: Sink<B, E>,
    scheduler: Scheduler,
  ) {
    this.f = f
    this.concurrency = concurrency
    this.sink = sink
    this.scheduler = scheduler
    this.buffer = []
    this.innerDisposables = []
    this.active = 0
    this.outerEnded = false
    this.disposed = false
  }

  tryStart(): void {
    while (this.active < this.concurrency && this.buffer.length > 0) {
      const value = this.buffer.shift()!
      this.active++

      const innerSource = _getSource(this.f(value))
      this.innerDisposables.push(
        innerSource.run(
          new MergeMapInnerSink<B, E>(this as MergeMapState<unknown, B, E>),
          this.scheduler,
        ),
      )
    }
  }
}

class MergeMapSource<A, B, E> implements Source<B, E> {
  declare readonly f: (a: A) => Event<B, E>
  declare readonly concurrency: number
  declare readonly source: Source<A, E>

  constructor(f: (a: A) => Event<B, E>, concurrency: number, source: Source<A, E>) {
    this.f = f
    this.concurrency = concurrency
    this.source = source
  }

  run(sink: Sink<B, E>, scheduler: Scheduler): Disposable {
    const state = new MergeMapState<A, B, E>(this.f, this.concurrency, sink, scheduler)
    const outerDisposable = this.source.run(new MergeMapOuterSink(state), scheduler)

    return {
      dispose() {
        state.disposed = true
        outerDisposable.dispose()
        for (const d of state.innerDisposables) {
          d.dispose()
        }
      },
    }
  }
}

/**
 * Map each value to an Event and merge the results with bounded concurrency.
 *
 * Denotation: `mergeMap(f, c, e) = merge(map(f, e))` with
 * at most `c` inner streams active at any time. Values from finished
 * inner streams are replaced by newly spawned ones from the buffer.
 */
export const mergeMap = <A, B, E>(
  f: (a: A) => Event<B, E>,
  concurrency: number,
  event: Event<A, E>,
): Event<B, E> => _createEvent(new MergeMapSource(f, concurrency, _getSource(event)))
