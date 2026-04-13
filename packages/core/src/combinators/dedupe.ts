/**
 * dedupe combinator.
 *
 * Denotation: suppress consecutive duplicate values.
 * `dedupe(eq, e) = [(t, v) | (t, v) ∈ e, v ≠ prev]`
 * where `prev` is the most recently emitted value.
 */

import type { Disposable, Event, Scheduler, Sink, Source, Time } from "aeon-types"
import { Pipe } from "../internal/Pipe.js"
import { _createEvent, _getSource } from "../internal/event.js"

class DedupeSink<A, E> extends Pipe<A, E> {
  declare readonly eq: (a: A, b: A) => boolean
  declare prev: A
  declare init: boolean

  constructor(eq: (a: A, b: A) => boolean, sink: Sink<A, E>) {
    super(sink)
    this.eq = eq
    this.prev = undefined!
    this.init = true
  }

  event(time: Time, value: A): void {
    if (this.init) {
      this.init = false
      this.prev = value
      this.sink.event(time, value)
    } else if (!this.eq(this.prev, value)) {
      this.prev = value
      this.sink.event(time, value)
    }
  }
}

class DedupeSource<A, E> implements Source<A, E> {
  declare readonly eq: (a: A, b: A) => boolean
  declare readonly source: Source<A, E>

  constructor(eq: (a: A, b: A) => boolean, source: Source<A, E>) {
    this.eq = eq
    this.source = source
  }

  run(sink: Sink<A, E>, scheduler: Scheduler): Disposable {
    return this.source.run(new DedupeSink(this.eq, sink), scheduler)
  }
}

const defaultEq = <A>(a: A, b: A): boolean => a === b

/**
 * Suppress consecutive duplicate values.
 *
 * Denotation: emits a value only when it differs from the previous
 * emission, according to the provided equality function (defaults to `===`).
 */
export const dedupe = <A, E>(
  event: Event<A, E>,
  eq: (a: A, b: A) => boolean = defaultEq,
): Event<A, E> => _createEvent(new DedupeSource(eq, _getSource(event)))
