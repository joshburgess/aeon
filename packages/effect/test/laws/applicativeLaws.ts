/**
 * Applicative laws, generic over a `TypeLambda` `F` whose values can be cast
 * to an aeon `Event` for equality comparison.
 *
 * We encode the four canonical laws in their `ap`-based form, using
 * `SemiApplicative.ap` + `Of.of`. (`Applicative` in @effect/typeclass is
 * `SemiApplicative & Product`, and `Product extends Of`, so the instance
 * passed in must provide both `ap` (derivable from `product`/`zipWith`) and
 * `of`.)
 *
 *   identity:      v  ≡  ap(of(id), v)
 *   homomorphism:  ap(of(f), of(x))  ≡  of(f(x))
 *   interchange:   ap(u, of(y))      ≡  ap(of(f => f(y)), u)
 *   composition:   ap(ap(ap(of(∘), u), v), w)  ≡  ap(u, ap(v, w))
 */

import type { Applicative } from "@effect/typeclass/Applicative"
import { ap as mkAp } from "@effect/typeclass/SemiApplicative"
import { expect, prop } from "@effect/vitest"
import type { Event } from "aeon-types"
import type * as fc from "effect/FastCheck"
import type { Kind, TypeLambda } from "effect/HKT"
import { type EqEventOptions, eqEvent } from "../helpers/eqEvent.js"

export interface ApplicativeLawsConfig<F extends TypeLambda, A, B, C, E> {
  readonly F: Applicative<F>
  readonly arbFA: fc.Arbitrary<Kind<F, never, never, E, A>>
  readonly arbFAtoB: fc.Arbitrary<Kind<F, never, never, E, (a: A) => B>>
  readonly arbFBtoC: fc.Arbitrary<Kind<F, never, never, E, (b: B) => C>>
  readonly arbA: fc.Arbitrary<A>
  readonly arbAtoB: fc.Arbitrary<(a: A) => B>
  /** Cast the TypeLambda value to an aeon `Event` for equality comparison. */
  readonly asEvent: <X>(fx: Kind<F, never, never, E, X>) => Event<X, E>
  readonly eqOptions?: EqEventOptions<unknown, unknown>
}

export const applicativeLaws = <F extends TypeLambda, A, B, C, E = never>(
  config: ApplicativeLawsConfig<F, A, B, C, E>,
): void => {
  const { F, arbFA, arbFAtoB, arbFBtoC, arbA, arbAtoB, asEvent, eqOptions } = config
  const ap = mkAp(F)

  prop("identity: ap(of(id), v) ≡ v", [arbFA], ([v]) => {
    const id = (a: A): A => a
    const lhs = ap(F.of(id), v)
    expect(
      eqEvent(
        asEvent(lhs) as Event<unknown, E>,
        asEvent(v) as Event<unknown, E>,
        eqOptions as EqEventOptions<unknown, E>,
      ),
    ).toBe(true)
  })

  prop("homomorphism: ap(of(f), of(x)) ≡ of(f(x))", [arbAtoB, arbA], ([f, a]) => {
    const lhs = ap(F.of(f), F.of(a))
    const rhs = F.of(f(a))
    expect(
      eqEvent(
        asEvent(lhs) as Event<unknown, E>,
        asEvent(rhs) as Event<unknown, E>,
        eqOptions as EqEventOptions<unknown, E>,
      ),
    ).toBe(true)
  })

  prop("interchange: ap(u, of(y)) ≡ ap(of(f => f(y)), u)", [arbFAtoB, arbA], ([u, y]) => {
    const lhs = ap(u, F.of(y))
    const rhs = ap(
      F.of((f: (a: A) => B) => f(y)),
      u,
    )
    expect(
      eqEvent(
        asEvent(lhs) as Event<unknown, E>,
        asEvent(rhs) as Event<unknown, E>,
        eqOptions as EqEventOptions<unknown, E>,
      ),
    ).toBe(true)
  })

  prop(
    "composition: ap(ap(ap(of(∘), u), v), w) ≡ ap(u, ap(v, w))",
    [arbFBtoC, arbFAtoB, arbFA],
    ([u, v, w]) => {
      const compose =
        (bc: (b: B) => C) =>
        (ab: (a: A) => B) =>
        (a: A): C =>
          bc(ab(a))
      const lhs = ap(ap(ap(F.of(compose), u), v), w)
      const rhs = ap(u, ap(v, w))
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
