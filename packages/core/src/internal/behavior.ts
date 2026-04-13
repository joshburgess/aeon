/**
 * Internal Behavior representation.
 *
 * A Behavior<A, E> is a continuous function of time: Time → A.
 * Internally it's a discriminated union of evaluation strategies,
 * with dirty-flag caching for derived behaviors.
 */

import type { Behavior, Disposable, Event, Scheduler, Sink, Time } from "aeon-types"
import { _getSource } from "./event.js"

// --- Internal tag ---

const BEHAVIOR_KEY = Symbol("pulse/behavior")

/** Discriminated union of behavior implementations. */
export type BehaviorImpl<A> =
  | { readonly tag: "constant"; readonly value: A }
  | { readonly tag: "function"; readonly f: (time: Time) => A }
  | { readonly tag: "stepper"; initial: A; value: A; time: Time; generation: number }
  | {
      readonly tag: "map"
      readonly f: (a: unknown) => A
      readonly source: BehaviorImpl<unknown>
      cachedGeneration: number
      cached: A | undefined
    }
  | {
      readonly tag: "lift2"
      readonly f: (a: unknown, b: unknown) => A
      readonly a: BehaviorImpl<unknown>
      readonly b: BehaviorImpl<unknown>
      cachedGeneration: number
      cached: A | undefined
    }
  | { readonly tag: "switcher"; current: BehaviorImpl<A> }

interface BehaviorWrapper<A> {
  readonly [BEHAVIOR_KEY]: BehaviorImpl<A>
}

/** Create an opaque Behavior from a BehaviorImpl. Internal use only. */
export const _createBehavior = <A, E = never>(impl: BehaviorImpl<A>): Behavior<A, E> =>
  ({ [BEHAVIOR_KEY]: impl }) as unknown as Behavior<A, E>

/** Extract the BehaviorImpl from an opaque Behavior. Internal use only. */
export const _getBehaviorImpl = <A>(behavior: Behavior<A, unknown>): BehaviorImpl<A> =>
  (behavior as unknown as BehaviorWrapper<A>)[BEHAVIOR_KEY]

// --- Generation tracking ---

/**
 * Compute the current generation of a behavior tree. This is the sum
 * of all stepper generations in the tree. If any stepper's generation
 * changed since the last cache, the cached value is stale.
 *
 * Function-based and switcher behaviors return -1 (never cacheable).
 */
const currentGeneration = (impl: BehaviorImpl<unknown>): number => {
  switch (impl.tag) {
    case "constant":
      return 0
    case "function":
    case "switcher":
      return -1 // Never cacheable
    case "stepper":
      return impl.generation
    case "map":
      return currentGeneration(impl.source)
    case "lift2": {
      const ga = currentGeneration(impl.a)
      const gb = currentGeneration(impl.b)
      if (ga < 0 || gb < 0) return -1
      return ga + gb
    }
  }
}

// --- Sampling ---

/**
 * Sample a behavior at a point in time.
 *
 * Denotation: evaluates `behavior(time)`.
 */
export const sampleImpl = <A>(impl: BehaviorImpl<A>, time: Time): A => {
  switch (impl.tag) {
    case "constant":
      return impl.value
    case "function":
      return impl.f(time)
    case "stepper":
      return impl.value
    case "map": {
      const gen = currentGeneration(impl)
      if (gen >= 0 && impl.cached !== undefined && impl.cachedGeneration === gen) {
        return impl.cached
      }
      const result = impl.f(sampleImpl(impl.source, time))
      ;(impl as { cached: A | undefined }).cached = result
      ;(impl as { cachedGeneration: number }).cachedGeneration = gen
      return result
    }
    case "lift2": {
      const gen = currentGeneration(impl)
      if (gen >= 0 && impl.cached !== undefined && impl.cachedGeneration === gen) {
        return impl.cached
      }
      const result = impl.f(sampleImpl(impl.a, time), sampleImpl(impl.b, time))
      ;(impl as { cached: A | undefined }).cached = result
      ;(impl as { cachedGeneration: number }).cachedGeneration = gen
      return result
    }
    case "switcher":
      return sampleImpl(impl.current, time)
  }
}

/**
 * Sample a Behavior at a time.
 */
export const sampleBehavior = <A>(behavior: Behavior<A, unknown>, time: Time): A =>
  sampleImpl(_getBehaviorImpl(behavior), time)

// --- Generation bump ---

/** Bump a stepper's generation to invalidate downstream caches. */
export const bumpGeneration = (impl: BehaviorImpl<unknown>): void => {
  if (impl.tag === "stepper") {
    impl.generation++
  }
}

// --- Stepper subscription ---

/**
 * Subscribe a stepper behavior to an event stream.
 * Returns a Disposable to unsubscribe.
 */
export const subscribeStepperToEvent = <A>(
  stepperImpl: BehaviorImpl<A> & { tag: "stepper" },
  event: Event<A, unknown>,
  scheduler: Scheduler,
): Disposable => {
  const source = _getSource(event)
  const sink: Sink<A, unknown> = {
    event(time: Time, value: A) {
      stepperImpl.value = value
      stepperImpl.time = time
      stepperImpl.generation++
    },
    error() {},
    end() {},
  }
  return source.run(sink, scheduler)
}
