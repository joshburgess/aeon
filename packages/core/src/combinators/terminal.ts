/**
 * Terminal combinators: reduce, observe, drain.
 *
 * These activate (subscribe to) the stream and return a Promise
 * that resolves when the stream ends.
 *
 * Uses monomorphic Sink classes for V8 hidden class stability.
 * Hot paths use local variable hoisting for function properties.
 */

import { DURATION_ZERO, type Event, type Scheduler, type Sink, type Time } from "aeon-types"
import { _getSource, isSyncSource } from "../internal/event.js"

// --- Sink classes for V8 monomorphism ---

class ReduceSink<A, B, E> implements Sink<A, E> {
  declare readonly f: (acc: B, a: A) => B
  declare acc: B
  declare readonly resolve: (value: B) => void
  declare readonly reject: (err: E) => void

  constructor(
    f: (acc: B, a: A) => B,
    seed: B,
    resolve: (value: B) => void,
    reject: (err: E) => void,
  ) {
    this.f = f
    this.acc = seed
    this.resolve = resolve
    this.reject = reject
  }

  event(_time: Time, value: A): void {
    const f = this.f
    this.acc = f(this.acc, value)
  }

  error(_time: Time, err: E): void {
    this.reject(err)
  }

  end(_time: Time): void {
    this.resolve(this.acc)
  }
}

class ObserveSink<A, E> implements Sink<A, E> {
  declare readonly f: (a: A) => void
  declare readonly resolve: () => void
  declare readonly reject: (err: E) => void

  constructor(f: (a: A) => void, resolve: () => void, reject: (err: E) => void) {
    this.f = f
    this.resolve = resolve
    this.reject = reject
  }

  event(_time: Time, value: A): void {
    const f = this.f
    f(value)
  }

  error(_time: Time, err: E): void {
    this.reject(err)
  }

  end(_time: Time): void {
    this.resolve()
  }
}

class DrainSink<E> implements Sink<unknown, E> {
  declare readonly resolve: () => void
  declare readonly reject: (err: E) => void

  constructor(resolve: () => void, reject: (err: E) => void) {
    this.resolve = resolve
    this.reject = reject
  }

  event(): void {}

  error(_time: Time, err: E): void {
    this.reject(err)
  }

  end(_time: Time): void {
    this.resolve()
  }
}

// --- Public API ---

/**
 * Fold all values into a single result. Activates the stream.
 *
 * Denotation: `reduce(f, seed, e) = foldl f seed (map snd e)`
 *
 * Uses sync loop compilation when the source chain is fully synchronous,
 * bypassing the Sink protocol for a tight for-loop.
 */
export const reduce = <A, B, E>(
  f: (acc: B, a: A) => B,
  seed: B,
  event: Event<A, E>,
  scheduler: Scheduler,
): Promise<B> => {
  const source = _getSource(event)

  if (isSyncSource(source)) {
    try {
      let acc = seed
      source.syncIterate((value: A) => {
        acc = f(acc, value)
        return true
      })
      return Promise.resolve(acc)
    } catch (err) {
      return Promise.reject(err)
    }
  }

  return new Promise((resolve, reject) => {
    source.run(new ReduceSink(f, seed, resolve, reject), scheduler)
  })
}

/**
 * Run a side-effect for each value. Activates the stream.
 *
 * Denotation: executes the effect for each `(t, v)` in the event sequence.
 */
export const observe = <A, E>(
  f: (a: A) => void,
  event: Event<A, E>,
  scheduler: Scheduler,
): Promise<void> => {
  const source = _getSource(event)

  if (isSyncSource(source)) {
    try {
      source.syncIterate((value: A) => {
        f(value)
        return true
      })
      return Promise.resolve()
    } catch (err) {
      return Promise.reject(err)
    }
  }

  return new Promise((resolve, reject) => {
    source.run(new ObserveSink(f, resolve, reject), scheduler)
  })
}

/**
 * Activate the stream, discarding all values. Returns when the stream ends.
 *
 * Denotation: activates the event sequence purely for its effects.
 */
export const drain = <A, E>(event: Event<A, E>, scheduler: Scheduler): Promise<void> => {
  const source = _getSource(event)

  if (isSyncSource(source)) {
    try {
      source.syncIterate(() => true)
      return Promise.resolve()
    } catch (err) {
      return Promise.reject(err)
    }
  }

  return new Promise((resolve, reject) => {
    source.run(new DrainSink(resolve, reject) as unknown as Sink<A, E>, scheduler)
  })
}
