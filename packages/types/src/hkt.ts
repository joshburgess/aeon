/**
 * Higher-Kinded Type encoding via Type Lambdas.
 *
 * The `TypeLambda` interface, `Kind` type, and the variance helpers
 * (`Contravariant` / `Covariant` / `Invariant`) in the block marked
 * "BEGIN VERBATIM COPY" below are copied **verbatim** from Effect-TS:
 *
 *   https://github.com/Effect-TS/effect/blob/main/packages/effect/src/HKT.ts
 *   https://github.com/Effect-TS/effect/blob/main/packages/effect/src/Types.ts
 *
 * Effect is MIT-licensed (Copyright (c) 2023-present The Effect Authors).
 * See https://github.com/Effect-TS/effect/blob/main/LICENSE.
 *
 * ### Why a verbatim copy instead of a dependency?
 *
 * Keeping the shape structurally identical to Effect's `TypeLambda` and
 * `Kind` means a bridge library between aeon and Effect can define
 * `Functor<EventTypeLambda>` using Effect's typeclass module and have it
 * type-check against aeon's `Event`. Because TypeScript is structural, a
 * parallel definition is as good as an imported one for type-level
 * purposes — without the install footprint or semver coupling of a hard
 * dep on `effect` from aeon's smallest package.
 *
 * ### Don't modify the verbatim block locally
 *
 * A CI drift check fetches the upstream HKT.ts / Types.ts and compares
 * the extracted `TypeLambda`, `Kind`, `Contravariant`, `Covariant`, and
 * `Invariant` definitions against the copies below. If Effect ever
 * changes their encoding, CI fails loudly and this file is updated
 * manually, not automatically.
 *
 * The typeclass interfaces (Functor / Applicative / Monad / Filterable)
 * and the `liftA2` / `liftA3` helpers **below** the verbatim block are
 * aeon's own — they use Effect's Kind encoding but a flatter hierarchy
 * than Effect's fragmented typeclass module.
 */

// ============================================================================
// BEGIN VERBATIM COPY — Effect-TS packages/effect/src/Types.ts (variance)
// ============================================================================

/**
 * @since 3.9.0
 * @category models
 */
export type Invariant<A> = (_: A) => A

/**
 * @since 3.9.0
 * @category models
 */
export type Covariant<A> = (_: never) => A

/**
 * @since 3.9.0
 * @category models
 */
export type Contravariant<A> = (_: A) => void

// ============================================================================
// BEGIN VERBATIM COPY — Effect-TS packages/effect/src/HKT.ts
// ============================================================================

/**
 * @since 2.0.0
 */
export declare const URI: unique symbol

/**
 * @since 2.0.0
 */
export interface TypeClass<F extends TypeLambda> {
  readonly [URI]?: F
}

/**
 * @since 2.0.0
 */
export interface TypeLambda {
  readonly In: unknown
  readonly Out2: unknown
  readonly Out1: unknown
  readonly Target: unknown
}

/**
 * @since 2.0.0
 */
export type Kind<F extends TypeLambda, In, Out2, Out1, Target> = F extends {
  readonly type: unknown
} ? (F & {
    readonly In: In
    readonly Out2: Out2
    readonly Out1: Out1
    readonly Target: Target
  })["type"]
  : {
    readonly F: F
    readonly In: Contravariant<In>
    readonly Out2: Covariant<Out2>
    readonly Out1: Covariant<Out1>
    readonly Target: Invariant<Target>
  }

// ============================================================================
// END VERBATIM COPY — aeon's own typeclass machinery below
// ============================================================================

/**
 * Convention for aeon's data types (`Event<A, E>`, `Behavior<A, E>`):
 *
 *   - `Target` = A — the value/success slot.
 *   - `Out1`   = E — the error channel.
 *   - `Out2`   is unused and fixed at `never` for covariant-empty.
 *   - `In`     is unused and fixed at `unknown` for contravariant-empty.
 *
 * This matches the slot conventions Effect uses for its own `Effect` and
 * `Stream` types (`Target` = value, `Out1` = error), so instances written
 * against aeon's type lambdas map one-for-one onto Effect's.
 */

/**
 * Functor — types that support `map`.
 *
 * Laws:
 *   - Identity:    `map(id, fa) === fa`
 *   - Composition: `map(f ∘ g, fa) === map(f, map(g, fa))`
 */
export interface Functor<F extends TypeLambda> {
  readonly map: <In, Out2, E, A, B>(
    f: (a: A) => B,
    fa: Kind<F, In, Out2, E, A>,
  ) => Kind<F, In, Out2, E, B>;
}

/**
 * Applicative — Functors with `of` (pure) and `ap` (apply).
 *
 * `of` uses the minimally-requiring type parameters in each slot:
 *   - `In`   = `unknown` (contravariant zero — "requires nothing")
 *   - `Out2` = `never`   (covariant zero — "produces nothing in this channel")
 *   - `Out1` = `never`   (covariant zero — "cannot fail")
 *
 * This matches Effect's `Pointed` signature exactly.
 *
 * Laws (in addition to Functor laws):
 *   - Identity:       `ap(of(id), fa) === fa`
 *   - Homomorphism:   `ap(of(f), of(a)) === of(f(a))`
 *   - Interchange:    `ap(ff, of(a)) === ap(of(f => f(a)), ff)`
 *   - Composition:    `ap(ap(ap(of(compose), ff), fg), fa) === ap(ff, ap(fg, fa))`
 */
export interface Applicative<F extends TypeLambda> extends Functor<F> {
  readonly of: <A>(a: A) => Kind<F, unknown, never, never, A>;
  readonly ap: <In, Out2, E, A, B>(
    ff: Kind<F, In, Out2, E, (a: A) => B>,
    fa: Kind<F, In, Out2, E, A>,
  ) => Kind<F, In, Out2, E, B>;
}

/**
 * Monad — Applicatives with `chain` (bind / flatMap).
 *
 * Laws (in addition to Applicative laws):
 *   - Left identity:  `chain(f, of(a)) === f(a)`
 *   - Right identity: `chain(of, m) === m`
 *   - Associativity:  `chain(g, chain(f, m)) === chain(x => chain(g, f(x)), m)`
 */
export interface Monad<F extends TypeLambda> extends Applicative<F> {
  readonly chain: <In, Out2, E, A, B>(
    f: (a: A) => Kind<F, In, Out2, E, B>,
    fa: Kind<F, In, Out2, E, A>,
  ) => Kind<F, In, Out2, E, B>;
}

/**
 * Filterable — types that support predicate-based filtering.
 *
 * Laws:
 *   - `filter(const true, fa) === fa`
 *   - `filter(p, filter(q, fa)) === filter(x => q(x) && p(x), fa)`
 */
export interface Filterable<F extends TypeLambda> {
  readonly filter: <In, Out2, E, A>(
    predicate: (a: A) => boolean,
    fa: Kind<F, In, Out2, E, A>,
  ) => Kind<F, In, Out2, E, A>;
}

// --- Derived generic combinators ---

/**
 * Lift a binary function over two Applicative values.
 *
 * `liftA2(A)(f, fa, fb) = A.ap(A.map(a => b => f(a, b), fa), fb)`
 */
export const liftA2 =
  <F extends TypeLambda>(A: Applicative<F>) =>
  <In, Out2, E, A1, A2, B>(
    f: (a1: A1, a2: A2) => B,
    fa1: Kind<F, In, Out2, E, A1>,
    fa2: Kind<F, In, Out2, E, A2>,
  ): Kind<F, In, Out2, E, B> =>
    A.ap(
      A.map((a1: A1) => (a2: A2) => f(a1, a2), fa1),
      fa2,
    );

/**
 * Lift a ternary function over three Applicative values.
 */
export const liftA3 =
  <F extends TypeLambda>(A: Applicative<F>) =>
  <In, Out2, E, A1, A2, A3, B>(
    f: (a1: A1, a2: A2, a3: A3) => B,
    fa1: Kind<F, In, Out2, E, A1>,
    fa2: Kind<F, In, Out2, E, A2>,
    fa3: Kind<F, In, Out2, E, A3>,
  ): Kind<F, In, Out2, E, B> =>
    A.ap(
      A.ap(
        A.map((a1: A1) => (a2: A2) => (a3: A3) => f(a1, a2, a3), fa1),
        fa2,
      ),
      fa3,
    );
