/**
 * Higher-Kinded Type encoding via URI-indexed Kind map.
 *
 * Uses module augmentation (Effect-TS / fp-ts style) so that each
 * package can register its own types without circular imports.
 */

// biome-ignore lint/suspicious/noEmptyInterface: open for module augmentation
export interface URItoKind<A, E> {}

/** Union of all registered type URIs. */
export type URIS = keyof URItoKind<unknown, unknown>;

/** Project a registered HKT to its concrete type given A and E. */
export type Kind<F extends URIS, A, E = never> = URItoKind<A, E>[F];

// --- Typeclass interfaces ---

export interface Functor<F extends URIS> {
  readonly URI: F;
  readonly map: <A, B, E>(f: (a: A) => B, fa: Kind<F, A, E>) => Kind<F, B, E>;
}

export interface Applicative<F extends URIS> extends Functor<F> {
  readonly of: <A>(a: A) => Kind<F, A, never>;
  readonly ap: <A, B, E>(ff: Kind<F, (a: A) => B, E>, fa: Kind<F, A, E>) => Kind<F, B, E>;
}

export interface Monad<F extends URIS> extends Applicative<F> {
  readonly chain: <A, B, E>(f: (a: A) => Kind<F, B, E>, fa: Kind<F, A, E>) => Kind<F, B, E>;
}

export interface Filterable<F extends URIS> {
  readonly URI: F;
  readonly filter: <A, E>(predicate: (a: A) => boolean, fa: Kind<F, A, E>) => Kind<F, A, E>;
}

// --- Derived combinators ---

/** Lift a binary function over two Applicative values. */
export const liftA2 =
  <F extends URIS>(A: Applicative<F>) =>
  <A1, A2, B, E>(
    f: (a1: A1, a2: A2) => B,
    fa1: Kind<F, A1, E>,
    fa2: Kind<F, A2, E>,
  ): Kind<F, B, E> =>
    A.ap(
      A.map((a1: A1) => (a2: A2) => f(a1, a2), fa1),
      fa2,
    );

/** Lift a ternary function over three Applicative values. */
export const liftA3 =
  <F extends URIS>(A: Applicative<F>) =>
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
