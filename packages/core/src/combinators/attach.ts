/**
 * attach combinator.
 *
 * Denotation: `attach(f, sampled, sampler)` emits
 * `f(latestA, b)` whenever `sampler` fires, using the latest
 * value from `sampled`. Only emits after `sampled` has produced
 * at least one value.
 *
 * Uses monomorphic Sink/Source classes for V8 hidden class stability.
 */

import type { Disposable, Event, Scheduler, Sink, Source, Time } from "aeon-types"
import { disposeAll } from "../internal/dispose.js"
import { _createEvent, _getSource } from "../internal/event.js"

class AttachState<A, B, C, E> {
  declare latestA: A | undefined
  declare hasA: boolean
  declare readonly sink: Sink<C, E>
  declare readonly f: (a: A, b: B) => C

  constructor(f: (a: A, b: B) => C, sink: Sink<C, E>) {
    this.latestA = undefined
    this.hasA = false
    this.sink = sink
    this.f = f
  }
}

class AttachSampledSink<A, B, C, E> implements Sink<A, E> {
  declare readonly state: AttachState<A, B, C, E>

  constructor(state: AttachState<A, B, C, E>) {
    this.state = state
  }

  event(_time: Time, value: A): void {
    this.state.latestA = value
    this.state.hasA = true
  }

  error(time: Time, err: E): void {
    this.state.sink.error(time, err)
  }

  end(_time: Time): void {
    // sampled ending doesn't end the output — sampler controls timing
  }
}

class AttachSamplerSink<A, B, C, E> implements Sink<B, E> {
  declare readonly state: AttachState<A, B, C, E>

  constructor(state: AttachState<A, B, C, E>) {
    this.state = state
  }

  event(time: Time, value: B): void {
    if (this.state.hasA) {
      const f = this.state.f
      this.state.sink.event(time, f(this.state.latestA as A, value))
    }
  }

  error(time: Time, err: E): void {
    this.state.sink.error(time, err)
  }

  end(time: Time): void {
    this.state.sink.end(time)
  }
}

class AttachSource<A, B, C, E> implements Source<C, E> {
  declare readonly f: (a: A, b: B) => C
  declare readonly sampled: Source<A, E>
  declare readonly sampler: Source<B, E>

  constructor(f: (a: A, b: B) => C, sampled: Source<A, E>, sampler: Source<B, E>) {
    this.f = f
    this.sampled = sampled
    this.sampler = sampler
  }

  run(sink: Sink<C, E>, scheduler: Scheduler): Disposable {
    const state = new AttachState<A, B, C, E>(this.f, sink)
    return disposeAll([
      this.sampled.run(new AttachSampledSink(state), scheduler),
      this.sampler.run(new AttachSamplerSink(state), scheduler),
    ])
  }
}

/**
 * Combine the latest value from one stream with each emission of another.
 *
 * Emits `f(latestA, b)` each time `sampler` fires, using the most recent
 * value from `sampled`. Only emits after `sampled` has produced at least one value.
 *
 * The output ends when `sampler` ends. Errors from either source propagate.
 */
export const attach = <A, B, C, E>(
  f: (a: A, b: B) => C,
  sampled: Event<A, E>,
  sampler: Event<B, E>,
): Event<C, E> => _createEvent(new AttachSource(f, _getSource(sampled), _getSource(sampler)))
