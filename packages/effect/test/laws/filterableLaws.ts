/**
 * Filterable laws for `Event<A, E>`.
 *
 * @effect/typeclass's Filterable is defined by `filterMap` and `partitionMap`.
 * We encode the standard laws (following Purescript's `Filterable` class):
 *
 *   filterMap identity: filterMap(fa, Option.some) ≡ fa
 *   filterMap composition:
 *     filterMap(fa, a => Option.flatMap(f(a), g)) ≡ filterMap(filterMap(fa, f), g)
 *   partitionMap consistency with filterMap:
 *     filterMap(fa, a => Option.map(f(a), ... right)) agrees with partitionMap's right output
 */

import type { Filterable } from "@effect/typeclass/Filterable";
import { expect, prop } from "@effect/vitest";
import type { Event } from "aeon-types";
import * as Either from "effect/Either";
import type * as fc from "effect/FastCheck";
import * as Option from "effect/Option";
import type { EventTypeLambda } from "../../src/Event.js";
import { type EqEventOptions, eqEvent } from "../helpers/eqEvent.js";

export interface FilterableLawsConfig<A, B, C, E> {
  readonly F: Filterable<EventTypeLambda>;
  readonly arbFA: fc.Arbitrary<Event<A, E>>;
  readonly arbAToOptB: fc.Arbitrary<(a: A) => Option.Option<B>>;
  readonly arbBToOptC: fc.Arbitrary<(b: B) => Option.Option<C>>;
  readonly arbAToEither: fc.Arbitrary<(a: A) => Either.Either<C, B>>;
  readonly eqOptions?: EqEventOptions;
}

export const filterableLaws = <A, B, C, E = never>(
  config: FilterableLawsConfig<A, B, C, E>,
): void => {
  const { F, arbFA, arbAToOptB, arbBToOptC, arbAToEither, eqOptions } = config;

  prop("filterMap identity: filterMap(fa, some) ≡ fa", [arbFA], ([fa]) => {
    const lhs = F.filterMap(fa, (a: A) => Option.some(a));
    expect(eqEvent(lhs, fa, eqOptions)).toBe(true);
  });

  prop(
    "filterMap composition: filterMap(fa, g ∘ f) ≡ filterMap(filterMap(fa, f), g)",
    [arbFA, arbAToOptB, arbBToOptC],
    ([fa, f, g]) => {
      const lhs = F.filterMap(fa, (a: A) => Option.flatMap(f(a), (b) => g(b)));
      const rhs = F.filterMap(F.filterMap(fa, f), g);
      expect(eqEvent(lhs, rhs, eqOptions)).toBe(true);
    },
  );

  prop("partitionMap right ≡ filterMap(Either.getRight ∘ f)", [arbFA, arbAToEither], ([fa, f]) => {
    const [, right] = F.partitionMap(fa, f);
    const filtered = F.filterMap(fa, (a: A) => Either.getRight(f(a)));
    expect(eqEvent(right, filtered, eqOptions)).toBe(true);
  });

  prop("partitionMap left ≡ filterMap(Either.getLeft ∘ f)", [arbFA, arbAToEither], ([fa, f]) => {
    const [left] = F.partitionMap(fa, f);
    const filtered = F.filterMap(fa, (a: A) => Either.getLeft(f(a)));
    expect(eqEvent(left, filtered, eqOptions)).toBe(true);
  });
};
