/**
 * Covariant (Functor) laws for `Event<A, E>`.
 *
 *   identity:    map(id)        ≡ id
 *   composition: map(g ∘ f)     ≡ map(g) ∘ map(f)
 *
 * Each law is registered with vitest's `it.prop` (via @effect/vitest) so
 * failures produce shrunk counterexamples.
 */

import type { Covariant } from "@effect/typeclass/Covariant"
import { expect, prop } from "@effect/vitest"
import type { Event } from "aeon-types"
import type * as fc from "effect/FastCheck"
import type { Kind, TypeLambda } from "effect/HKT"
import { type EqEventOptions, eqEvent } from "../helpers/eqEvent.js"

export interface CovariantLawsConfig<F extends TypeLambda, A, B, C, E> {
  readonly F: Covariant<F>
  readonly arbFA: fc.Arbitrary<Kind<F, never, never, E, A>>
  readonly arbFToB: fc.Arbitrary<(a: A) => B>
  readonly arbGToC: fc.Arbitrary<(b: B) => C>
  /** Cast the TypeLambda value to an aeon `Event` for equality comparison. */
  readonly asEvent: <X>(fx: Kind<F, never, never, E, X>) => Event<X, E>
  readonly eqOptions?: EqEventOptions<unknown, unknown>
}

export const covariantLaws = <F extends TypeLambda, A, B, C, E = never>(
  config: CovariantLawsConfig<F, A, B, C, E>,
): void => {
  const { F, arbFA, arbFToB, arbGToC, asEvent, eqOptions } = config

  prop("identity: map(id) ≡ id", [arbFA], ([fa]) => {
    const lhs = F.map(fa, (a: A) => a)
    expect(
      eqEvent(
        asEvent(lhs) as Event<unknown, E>,
        asEvent(fa) as Event<unknown, E>,
        eqOptions as EqEventOptions<unknown, E>,
      ),
    ).toBe(true)
  })

  prop("composition: map(g ∘ f) ≡ map(g) ∘ map(f)", [arbFA, arbFToB, arbGToC], ([fa, f, g]) => {
    const lhs = F.map(fa, (a: A) => g(f(a)))
    const rhs = F.map(F.map(fa, f), g)
    expect(
      eqEvent(
        asEvent(lhs) as Event<unknown, E>,
        asEvent(rhs) as Event<unknown, E>,
        eqOptions as EqEventOptions<unknown, E>,
      ),
    ).toBe(true)
  })
}
