/**
 * Higher-Kinded Type encoding via Type Lambdas.
 *
 * A TypeLambda is an interface whose `type` property computes a concrete
 * type from its slot parameters (`A`, `E`). To "apply" a lambda, we
 * intersect it with concrete values for its slots and read `["type"]`.
 *
 * This is the "Lightyear" encoding popularized by Effect 3.x. It replaces
 * the older URI-indexed `URItoKind` registry approach because:
 *
 *   - No global registry / module augmentation — each type declares its
 *     own lambda locally, alongside the data type it describes.
 *   - Extensible arity — adding a third slot (e.g. a reader channel `R`)
 *     later is non-breaking.
 *   - Cleaner error messages when typeclass constraints fail.
 *
 * Example — declaring a type lambda for `Event<A, E>`:
 *
 * ```ts
 * interface EventTypeLambda extends TypeLambda {
 *   readonly type: Event<this["A"], this["E"]>
 * }
 * ```
 *
 * Then `Kind<EventTypeLambda, number, string>` resolves to `Event<number, string>`.
 */

/**
 * Base type lambda interface.
 *
 * Concrete lambdas extend this interface and override `type` to reference
 * their slot parameters via `this["A"]` / `this["E"]`.
 */
export interface TypeLambda {
  readonly A: unknown;
  readonly E: unknown;
  readonly type: unknown;
}

/**
 * Apply a type lambda to concrete type arguments.
 *
 * Intersects `F` with the provided slot values, then reads `type`.
 * Because TypeScript resolves `this["A"]` / `this["E"]` against the
 * intersection, the `type` property evaluates to the substituted form.
 */
export type Kind<F extends TypeLambda, A, E = never> = (F & {
  readonly A: A;
  readonly E: E;
})["type"];

// --- Typeclass interfaces ---

/**
 * Functor — types that support `map`.
 *
 * Laws:
 *   - Identity:    `map(id, fa) === fa`
 *   - Composition: `map(f ∘ g, fa) === map(f, map(g, fa))`
 */
export interface Functor<F extends TypeLambda> {
  readonly map: <A, B, E>(f: (a: A) => B, fa: Kind<F, A, E>) => Kind<F, B, E>;
}

/**
 * Applicative — Functors with `of` (pure) and `ap` (apply).
 *
 * Laws (in addition to Functor laws):
 *   - Identity:       `ap(of(id), fa) === fa`
 *   - Homomorphism:   `ap(of(f), of(a)) === of(f(a))`
 *   - Interchange:    `ap(ff, of(a)) === ap(of(f => f(a)), ff)`
 *   - Composition:    `ap(ap(ap(of(compose), ff), fg), fa) === ap(ff, ap(fg, fa))`
 */
export interface Applicative<F extends TypeLambda> extends Functor<F> {
  readonly of: <A>(a: A) => Kind<F, A, never>;
  readonly ap: <A, B, E>(
    ff: Kind<F, (a: A) => B, E>,
    fa: Kind<F, A, E>,
  ) => Kind<F, B, E>;
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
  readonly chain: <A, B, E>(
    f: (a: A) => Kind<F, B, E>,
    fa: Kind<F, A, E>,
  ) => Kind<F, B, E>;
}

/**
 * Filterable — types that support predicate-based filtering.
 *
 * Laws:
 *   - `filter(const true, fa) === fa`
 *   - `filter(p, filter(q, fa)) === filter(x => q(x) && p(x), fa)`
 */
export interface Filterable<F extends TypeLambda> {
  readonly filter: <A, E>(
    predicate: (a: A) => boolean,
    fa: Kind<F, A, E>,
  ) => Kind<F, A, E>;
}

// --- Derived generic combinators ---

/**
 * Lift a binary function over two Applicative values.
 *
 * `liftA2(A)(f, fa, fb) = A.ap(A.map(a => b => f(a, b), fa), fb)`
 */
export const liftA2 =
  <F extends TypeLambda>(A: Applicative<F>) =>
  <A1, A2, B, E>(
    f: (a1: A1, a2: A2) => B,
    fa1: Kind<F, A1, E>,
    fa2: Kind<F, A2, E>,
  ): Kind<F, B, E> =>
    A.ap(
      A.map((a1: A1) => (a2: A2) => f(a1, a2), fa1),
      fa2,
    );

/**
 * Lift a ternary function over three Applicative values.
 */
export const liftA3 =
  <F extends TypeLambda>(A: Applicative<F>) =>
  <A1, A2, A3, B, E>(
    f: (a1: A1, a2: A2, a3: A3) => B,
    fa1: Kind<F, A1, E>,
    fa2: Kind<F, A2, E>,
    fa3: Kind<F, A3, E>,
  ): Kind<F, B, E> =>
    A.ap(
      A.ap(
        A.map((a1: A1) => (a2: A2) => (a3: A3) => f(a1, a2, a3), fa1),
        fa2,
      ),
      fa3,
    );
