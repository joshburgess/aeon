/**
 * Typeclass instances for Event and Behavior.
 *
 * These expose aeon's concrete combinators through the type-lambda-based
 * typeclass interfaces (`Functor`, `Applicative`, `Monad`, `Filterable`)
 * defined in `aeon-types`. Users can write typeclass-generic code against
 * these instances and instantiate it for either Event or Behavior.
 *
 * Each instance method delegates directly to the corresponding concrete
 * combinator — no runtime cost beyond the object literal. Tree-shakers
 * can drop unused instances because they're defined as module-scope
 * `const` values in a `sideEffects: false` package.
 *
 * Example — writing generic code that works for any Applicative:
 *
 * ```ts
 * import { liftA2, type Applicative, type TypeLambda } from "aeon-types";
 * import { EventApplicative, BehaviorApplicative } from "aeon-core";
 *
 * const sumTwo = liftA2(EventApplicative)((a: number, b: number) => a + b, e1, e2);
 * const sumTwoB = liftA2(BehaviorApplicative)((a: number, b: number) => a + b, b1, b2);
 * ```
 */

import type {
  Applicative,
  Behavior,
  BehaviorTypeLambda,
  Event,
  EventTypeLambda,
  Filterable,
  Functor,
  Monad,
} from "aeon-types";
import { constantB, liftA2B, mapB, switchB } from "./behavior.js";
import { chain } from "./combinators/chain.js";
import { filter } from "./combinators/filter.js";
import { map } from "./combinators/map.js";
import { now } from "./constructors.js";

// --- Event instances ---

/** `Functor` instance for `Event`. */
export const EventFunctor: Functor<EventTypeLambda> = {
  map,
};

/**
 * Monadic `ap` for `Event`: `ap(ff, fa) = chain(f => map(f, fa), ff)`.
 *
 * For every function emitted by `ff`, re-subscribes to `fa` and emits
 * each application. This is the lawful (Applicative-obeys-laws)
 * derivation — users who want zip-style or combineLatest-style
 * application should reach for `combine` / `zip` directly.
 */
const apEvent = <A, B, E>(
  ff: Event<(a: A) => B, E>,
  fa: Event<A, E>,
): Event<B, E> => chain((f: (a: A) => B) => map(f, fa), ff);

/** `Applicative` instance for `Event`. */
export const EventApplicative: Applicative<EventTypeLambda> = {
  map,
  of: now,
  ap: apEvent,
};

/** `Monad` instance for `Event`. */
export const EventMonad: Monad<EventTypeLambda> = {
  map,
  of: now,
  ap: apEvent,
  chain,
};

/** `Filterable` instance for `Event`. */
export const EventFilterable: Filterable<EventTypeLambda> = {
  filter,
};

// --- Behavior instances ---

/** `Functor` instance for `Behavior`. */
export const BehaviorFunctor: Functor<BehaviorTypeLambda> = {
  map: mapB,
};

/**
 * Applicative `ap` for `Behavior`: sample both at the same time and apply.
 *
 * Derived from `liftA2B`, which has an optimized fast path for
 * two-constant cases.
 */
const apBehavior = <A, B, E>(
  ff: Behavior<(a: A) => B, E>,
  fa: Behavior<A, E>,
): Behavior<B, E> => liftA2B((f: (a: A) => B, a: A) => f(a), ff, fa);

/** `Applicative` instance for `Behavior`. */
export const BehaviorApplicative: Applicative<BehaviorTypeLambda> = {
  map: mapB,
  of: constantB,
  ap: apBehavior,
};

/**
 * Monadic `chain` for `Behavior`: `chain(f, b) = switchB(mapB(f, b))`.
 *
 * At time `t`, samples `b`, applies `f` to get an inner `Behavior`,
 * then samples that at `t`. This is the continuous-time analog of
 * `Event.chain`.
 */
const chainBehavior = <A, B, E>(
  f: (a: A) => Behavior<B, E>,
  b: Behavior<A, E>,
): Behavior<B, E> => switchB(mapB(f, b));

/** `Monad` instance for `Behavior`. */
export const BehaviorMonad: Monad<BehaviorTypeLambda> = {
  map: mapB,
  of: constantB,
  ap: apBehavior,
  chain: chainBehavior,
};
