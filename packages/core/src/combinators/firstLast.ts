/**
 * first and last combinators.
 *
 * first: emit only the first value (optionally matching a predicate), then end.
 * last: emit only the final value (optionally matching a predicate) on end.
 */

import type { Disposable, Event, Scheduler, Sink, Source, Time } from "aeon-types"
import { Pipe } from "../internal/Pipe.js"
import { SettableDisposable } from "../internal/dispose.js"
import { _createEvent, _getSource } from "../internal/event.js"

// --- first ---

class FirstSink<A, E> extends Pipe<A, E> {
  declare readonly predicate: ((a: A) => boolean) | undefined
  declare readonly disposable: SettableDisposable
  declare found: boolean

  constructor(
    predicate: ((a: A) => boolean) | undefined,
    sink: Sink<A, E>,
    disposable: SettableDisposable,
  ) {
    super(sink)
    this.predicate = predicate
    this.disposable = disposable
    this.found = false
  }

  event(time: Time, value: A): void {
    if (this.found) return
    if (this.predicate !== undefined && !this.predicate(value)) return
    this.found = true
    this.sink.event(time, value)
    this.disposable.dispose()
    this.sink.end(time)
  }

  end(time: Time): void {
    if (!this.found) {
      this.sink.end(time)
    }
  }
}

class FirstSource<A, E> implements Source<A, E> {
  declare readonly predicate: ((a: A) => boolean) | undefined
  declare readonly source: Source<A, E>

  constructor(predicate: ((a: A) => boolean) | undefined, source: Source<A, E>) {
    this.predicate = predicate
    this.source = source
  }

  run(sink: Sink<A, E>, scheduler: Scheduler): Disposable {
    const sd = new SettableDisposable()
    sd.set(this.source.run(new FirstSink(this.predicate, sink, sd), scheduler))
    return sd
  }
}

/**
 * Emit only the first value, then end.
 * With a predicate: emit the first value matching the predicate.
 *
 * Denotation: `first(e) = take(1, e)`
 *             `first(p, e) = take(1, filter(p, e))`
 */
export const first = <A, E>(event: Event<A, E>, predicate?: (a: A) => boolean): Event<A, E> =>
  _createEvent(new FirstSource(predicate, _getSource(event)))

// --- last ---

class LastSink<A, E> extends Pipe<A, E> {
  declare readonly predicate: ((a: A) => boolean) | undefined
  declare latest: A | typeof UNSET

  constructor(predicate: ((a: A) => boolean) | undefined, sink: Sink<A, E>) {
    super(sink)
    this.predicate = predicate
    this.latest = UNSET
  }

  event(_time: Time, value: A): void {
    if (this.predicate !== undefined && !this.predicate(value)) return
    this.latest = value
  }

  end(time: Time): void {
    if (this.latest !== UNSET) {
      this.sink.event(time, this.latest as A)
    }
    this.sink.end(time)
  }
}

const UNSET: unique symbol = Symbol("unset")

class LastSource<A, E> implements Source<A, E> {
  declare readonly predicate: ((a: A) => boolean) | undefined
  declare readonly source: Source<A, E>

  constructor(predicate: ((a: A) => boolean) | undefined, source: Source<A, E>) {
    this.predicate = predicate
    this.source = source
  }

  run(sink: Sink<A, E>, scheduler: Scheduler): Disposable {
    return this.source.run(new LastSink(this.predicate, sink), scheduler)
  }
}

/**
 * Emit only the final value when the stream ends.
 * With a predicate: emit the last value matching the predicate.
 *
 * Denotation: `last(e) = let vs = values(e) in [vs[|vs|-1]]`
 */
export const last = <A, E>(event: Event<A, E>, predicate?: (a: A) => boolean): Event<A, E> =>
  _createEvent(new LastSource(predicate, _getSource(event)))
