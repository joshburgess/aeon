/**
 * Monad laws, generic over a `TypeLambda` `F` whose values can be cast to an
 * aeon `Event` for equality comparison.
 *
 *   left identity:   flatMap(of(a), f)         ≡ f(a)
 *   right identity:  flatMap(m, of)            ≡ m
 *   associativity:   flatMap(flatMap(m, f), g) ≡ flatMap(m, a => flatMap(f(a), g))
 */

import type { Monad } from "@effect/typeclass/Monad"
import { expect, prop } from "@effect/vitest"
import type { Event } from "aeon-types"
import type * as fc from "effect/FastCheck"
import type { Kind, TypeLambda } from "effect/HKT"
import { type EqEventOptions, eqEvent } from "../helpers/eqEvent.js"

export type EventEq<A, E> = (a: Event<A, E>, b: Event<A, E>) => boolean

export interface MonadLawsConfig<F extends TypeLambda, A, B, C, E> {
  readonly M: Monad<F>
  readonly arbFA: fc.Arbitrary<Kind<F, never, never, E, A>>
  readonly arbA: fc.Arbitrary<A>
  readonly arbAToFB: fc.Arbitrary<(a: A) => Kind<F, never, never, E, B>>
  readonly arbBToFC: fc.Arbitrary<(b: B) => Kind<F, never, never, E, C>>
  /** Cast the TypeLambda value to an aeon `Event` for equality comparison. */
  readonly asEvent: <X>(fx: Kind<F, never, never, E, X>) => Event<X, E>
  readonly eqOptions?: EqEventOptions<unknown, unknown>
  /**
   * Equality used specifically for the **associativity** law. Defaults to
   * `eqEvent`. Sequential (chain-based) timed monads satisfy associativity
   * only up to the ordered event *sequence* (ignoring exact emission
   * times), not pointwise in time — override with `eqEventSeq` in that case.
   */
  readonly eqAssoc?: EventEq<unknown, unknown>
}

export const monadLaws = <F extends TypeLambda, A, B, C, E = never>(
  config: MonadLawsConfig<F, A, B, C, E>,
): void => {
  const { M, arbFA, arbA, arbAToFB, arbBToFC, asEvent, eqOptions, eqAssoc } = config
  const defaultEq: EventEq<unknown, unknown> = (a, b) =>
    eqEvent(a, b, eqOptions as EqEventOptions<unknown, unknown>)
  const assocEq = eqAssoc ?? defaultEq

  prop("left identity: flatMap(of(a), f) ≡ f(a)", [arbA, arbAToFB], ([a, f]) => {
    const lhs = M.flatMap(M.of(a), f)
    const rhs = f(a)
    expect(defaultEq(asEvent(lhs) as Event<unknown, E>, asEvent(rhs) as Event<unknown, E>)).toBe(
      true,
    )
  })

  prop("right identity: flatMap(m, of) ≡ m", [arbFA], ([m]) => {
    const lhs = M.flatMap(m, (a: A) => M.of(a))
    expect(defaultEq(asEvent(lhs) as Event<unknown, E>, asEvent(m) as Event<unknown, E>)).toBe(true)
  })

  prop(
    "associativity: flatMap(flatMap(m, f), g) ≡ flatMap(m, a => flatMap(f(a), g))",
    [arbFA, arbAToFB, arbBToFC],
    ([m, f, g]) => {
      const lhs = M.flatMap(M.flatMap(m, f), g)
      const rhs = M.flatMap(m, (a: A) => M.flatMap(f(a), g))
      expect(assocEq(asEvent(lhs) as Event<unknown, E>, asEvent(rhs) as Event<unknown, E>)).toBe(
        true,
      )
    },
  )
}
