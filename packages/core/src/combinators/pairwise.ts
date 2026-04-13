/**
 * pairwise combinator.
 *
 * Denotation: `pairwise(e) = [(t₂, [v₁, v₂]), (t₃, [v₂, v₃]), ...]`
 * Emits [previous, current] tuples, starting from the second event.
 */

import type { Disposable, Event, Scheduler, Sink, Source, Time } from "aeon-types"
import { _createEvent, _getSource } from "../internal/event.js"

class PairwiseSink<A, E> {
  declare readonly sink: Sink<[A, A], E>
  declare prev: A
  declare init: boolean

  constructor(sink: Sink<[A, A], E>) {
    this.sink = sink
    this.prev = undefined!
    this.init = true
  }

  event(time: Time, value: A): void {
    if (this.init) {
      this.init = false
    } else {
      this.sink.event(time, [this.prev, value])
    }
    this.prev = value
  }

  error(time: Time, err: E): void {
    this.sink.error(time, err)
  }

  end(time: Time): void {
    this.sink.end(time)
  }
}

class PairwiseSource<A, E> implements Source<[A, A], E> {
  declare readonly source: Source<A, E>

  constructor(source: Source<A, E>) {
    this.source = source
  }

  run(sink: Sink<[A, A], E>, scheduler: Scheduler): Disposable {
    return this.source.run(new PairwiseSink(sink) as unknown as Sink<A, E>, scheduler)
  }
}

/**
 * Emit [previous, current] pairs, starting from the second event.
 *
 * Denotation: `pairwise(e) = [(tₙ, [vₙ₋₁, vₙ]) | n >= 2]`
 */
export const pairwise = <A, E>(event: Event<A, E>): Event<[A, A], E> =>
  _createEvent(new PairwiseSource(_getSource(event)))
