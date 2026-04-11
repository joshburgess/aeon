/**
 * Behavior constructors and combinators.
 *
 * A Behavior is a continuous time-varying value: Time → A.
 * These are created with constructors, transformed with Functor/Applicative
 * operations, and bridged with Events via stepper/sample/snapshot.
 */

import type { Behavior, Disposable, Event, Scheduler, Sink, Time } from "@pulse/types";
import {
  type BehaviorImpl,
  _createBehavior,
  _getBehaviorImpl,
  sampleBehavior,
  subscribeStepperToEvent,
} from "./internal/behavior.js";
import { _createEvent, _getSource } from "./internal/event.js";

// --- Constructors ---

/**
 * A Behavior that always holds the same value.
 *
 * Denotation: `t => value`
 */
export const constantB = <A>(value: A): Behavior<A, never> =>
  _createBehavior({ tag: "constant", value });

/**
 * A Behavior defined by an arbitrary function of time.
 *
 * Denotation: `f` itself.
 */
export const fromFunction = <A>(f: (time: Time) => A): Behavior<A, never> =>
  _createBehavior({ tag: "function", f });

/**
 * The identity Behavior — its value is the current time.
 *
 * Denotation: `t => t`
 */
export const time: Behavior<Time, never> = fromFunction((t: Time) => t);

/**
 * Alias for constantB — the pure/of for Behavior's Applicative.
 */
export const pureB = constantB;

// --- Functor ---

/**
 * Transform the value of a Behavior.
 *
 * Denotation: `mapB(f, b) = t => f(b(t))`
 */
export const mapB = <A, B, E>(f: (a: A) => B, behavior: Behavior<A, E>): Behavior<B, E> => {
  const source = _getBehaviorImpl(behavior);

  // Optimization: map of constant is a constant
  if (source.tag === "constant") {
    return _createBehavior({ tag: "constant", value: f(source.value) });
  }

  // Optimization: map of function is a composed function
  if (source.tag === "function") {
    return _createBehavior({ tag: "function", f: (t: Time) => f(source.f(t)) });
  }

  return _createBehavior<B, E>({
    tag: "map",
    f: f as (a: unknown) => B,
    source: source as BehaviorImpl<unknown>,
    cachedGeneration: -1,
    cached: undefined,
  });
};

// --- Applicative ---

/**
 * Lift a binary function over two Behaviors.
 *
 * Denotation: `liftA2B(f, ba, bb) = t => f(ba(t), bb(t))`
 */
export const liftA2B = <A1, A2, B, E>(
  f: (a1: A1, a2: A2) => B,
  ba: Behavior<A1, E>,
  bb: Behavior<A2, E>,
): Behavior<B, E> => {
  const implA = _getBehaviorImpl(ba);
  const implB = _getBehaviorImpl(bb);

  // Optimization: both constant → constant
  if (implA.tag === "constant" && implB.tag === "constant") {
    return _createBehavior({ tag: "constant", value: f(implA.value, implB.value) });
  }

  return _createBehavior<B, E>({
    tag: "lift2",
    f: f as (a: unknown, b: unknown) => B,
    a: implA as BehaviorImpl<unknown>,
    b: implB as BehaviorImpl<unknown>,
    cachedGeneration: -1,
    cached: undefined,
  });
};

/**
 * Lift a ternary function over three Behaviors.
 */
export const liftA3B = <A1, A2, A3, B, E>(
  f: (a1: A1, a2: A2, a3: A3) => B,
  ba: Behavior<A1, E>,
  bb: Behavior<A2, E>,
  bc: Behavior<A3, E>,
): Behavior<B, E> =>
  liftA2B(
    (ab: (a3: A3) => B, c: A3) => ab(c),
    liftA2B((a: A1, b: A2) => (c: A3) => f(a, b, c), ba, bb),
    bc,
  );

// --- Event ↔ Behavior Bridge ---

/**
 * Create a Behavior that holds the latest value from an Event.
 *
 * Denotation: `stepper(init, e) = t => latestValue(e, t) ?? init`
 *
 * This is the primary push→pull bridge. The returned behavior is
 * push-updated when the event fires, and pull-sampled when read.
 *
 * IMPORTANT: The caller must provide a scheduler to subscribe to the event.
 * Returns [Behavior, Disposable] — the disposable unsubscribes from the event.
 */
export const stepper = <A, E>(
  initial: A,
  event: Event<A, E>,
  scheduler: Scheduler,
): [Behavior<A, E>, Disposable] => {
  const impl: BehaviorImpl<A> & { tag: "stepper" } = {
    tag: "stepper",
    initial,
    value: initial,
    time: scheduler.currentTime(),
    generation: 0,
  };

  const disposable = subscribeStepperToEvent(impl, event, scheduler);
  return [_createBehavior<A, E>(impl), disposable];
};

/**
 * Sample a Behavior whenever a sampler Event fires.
 *
 * Denotation: `sample(b, sampler) = [(t, b(t)) | (t, _) ∈ sampler]`
 */
export const sample = <A, B, E>(behavior: Behavior<A, E>, sampler: Event<B, E>): Event<A, E> => {
  const source = _getSource(sampler);
  return _createEvent({
    run(sink: Sink<A, E>, scheduler: Scheduler): Disposable {
      return source.run(
        {
          event(t: Time, _value: B) {
            const v = sampleBehavior(behavior, t);
            sink.event(t, v);
          },
          error(t: Time, err: E) {
            sink.error(t, err);
          },
          end(t: Time) {
            sink.end(t);
          },
        },
        scheduler,
      );
    },
  });
};

/**
 * Snapshot: sample a Behavior and combine with the Event value.
 *
 * Denotation: `snapshot(f, b, e) = [(t, f(b(t), v)) | (t, v) ∈ e]`
 */
export const snapshot = <A, B, C, E>(
  f: (a: A, b: B) => C,
  behavior: Behavior<A, E>,
  event: Event<B, E>,
): Event<C, E> => {
  const source = _getSource(event);
  return _createEvent({
    run(sink: Sink<C, E>, scheduler: Scheduler): Disposable {
      return source.run(
        {
          event(t: Time, value: B) {
            const bValue = sampleBehavior(behavior, t);
            sink.event(t, f(bValue, value));
          },
          error(t: Time, err: E) {
            sink.error(t, err);
          },
          end(t: Time) {
            sink.end(t);
          },
        },
        scheduler,
      );
    },
  });
};

/**
 * Dynamic Behavior switching.
 *
 * Holds `initial` until the event fires, then switches to the
 * Behavior carried by each event occurrence.
 *
 * Denotation: holds the most recently received Behavior; samples it.
 */
export const switcher = <A, E>(
  initial: Behavior<A, E>,
  event: Event<Behavior<A, E>, E>,
  scheduler: Scheduler,
): [Behavior<A, E>, Disposable] => {
  const impl: BehaviorImpl<A> & { tag: "switcher" } = {
    tag: "switcher",
    current: _getBehaviorImpl(initial),
  };

  const source = _getSource(event);
  const disposable = source.run(
    {
      event(_t: Time, newBehavior: Behavior<A, E>) {
        impl.current = _getBehaviorImpl(newBehavior);
      },
      error() {},
      end() {},
    },
    scheduler,
  );

  return [_createBehavior<A, E>(impl), disposable];
};

/**
 * Read the current value of a Behavior at a given time.
 */
export { sampleBehavior as readBehavior };
