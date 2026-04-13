/**
 * SemiApplicative laws, generic over a `TypeLambda` `F`.
 *
 * SemiApplicative has no `of`, so the usual four Applicative laws are not
 * available. We test the two structural laws that `product`/`map` must
 * satisfy:
 *
 *   associativity:
 *     product(product(fa, fb), fc)  ≡
 *       map(product(fa, product(fb, fc)), ([a, [b, c]]) => [[a, b], c])
 *
 *   naturality (map-product interaction):
 *     map(product(fa, fb), ([a, b]) => [f(a), g(b)])  ≡
 *       product(map(fa, f), map(fb, g))
 *
 * Both laws are purely equational and are what `Zip` provides under its
 * `coreZip` product.
 */

import type { SemiApplicative } from "@effect/typeclass/SemiApplicative"
import { expect, prop } from "@effect/vitest"
import type { Event } from "aeon-types"
import type * as fc from "effect/FastCheck"
import type { Kind, TypeLambda } from "effect/HKT"
import { type EqEventOptions, eqEvent } from "../helpers/eqEvent.js"

export interface SemiApplicativeLawsConfig<F extends TypeLambda, A, B, C, E> {
  readonly F: SemiApplicative<F>
  readonly arbFA: fc.Arbitrary<Kind<F, never, never, E, A>>
  readonly arbFB: fc.Arbitrary<Kind<F, never, never, E, B>>
  readonly arbFC: fc.Arbitrary<Kind<F, never, never, E, C>>
  readonly arbAToB: fc.Arbitrary<(a: A) => B>
  readonly arbBToC: fc.Arbitrary<(b: B) => C>
  /** Cast the TypeLambda value to an aeon `Event` for equality comparison. */
  readonly asEvent: <X>(fx: Kind<F, never, never, E, X>) => Event<X, E>
  /**
   * Event/error equality options. `SemiApplicative.product` produces nested
   * tuples, so callers should pass a structural equality (e.g. `deepEqual`)
   * via `eqA` — the default `Object.is` would never match fresh tuples.
   */
  readonly eqOptions?: EqEventOptions<unknown, unknown>
}

export const semiApplicativeLaws = <F extends TypeLambda, A, B, C, E = never>(
  config: SemiApplicativeLawsConfig<F, A, B, C, E>,
): void => {
  const { F, arbFA, arbFB, arbFC, arbAToB, arbBToC, asEvent, eqOptions } = config

  prop(
    "associativity: product(product(fa, fb), fc) ≡ map(product(fa, product(fb, fc)), reassoc)",
    [arbFA, arbFB, arbFC],
    ([fa, fb, fc]) => {
      const left = F.product(F.product(fa, fb), fc)
      const right = F.map(
        F.product(fa, F.product(fb, fc)),
        ([a, [b, c]]: [A, [B, C]]): [[A, B], C] => [[a, b], c],
      )
      expect(
        eqEvent(
          asEvent(left) as Event<unknown, E>,
          asEvent(right) as Event<unknown, E>,
          eqOptions as EqEventOptions<unknown, E>,
        ),
      ).toBe(true)
    },
  )

  prop(
    "naturality: map(product(fa, fb), ([a,b]) => [f(a), g(b)]) ≡ product(map(fa, f), map(fb, g))",
    [arbFA, arbFB, arbAToB, arbBToC],
    ([fa, fb, f, g]) => {
      // Reuse B→C for the second side by mapping B→C; we need a A→B and B→C
      // already, so for the left side we map fb using g (B→C). This exercises
      // both directions with independent functions.
      const lhs = F.map(F.product(fa, fb), ([a, b]: [A, B]): [B, C] => [f(a), g(b)])
      const rhs = F.product(F.map(fa, f), F.map(fb, g))
      expect(
        eqEvent(
          asEvent(lhs) as Event<unknown, E>,
          asEvent(rhs) as Event<unknown, E>,
          eqOptions as EqEventOptions<unknown, E>,
        ),
      ).toBe(true)
    },
  )
}
