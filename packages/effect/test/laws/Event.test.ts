/**
 * Law tests for the canonical @effect/typeclass instances over `Event<A, E>`.
 *
 * Inputs are leaf events (straight from `fromEntries`) so the laws exercise
 * the instance methods in isolation from each other. Each suite binds the
 * generic parameters to concrete shapes so the law functions can be called.
 */

import { describe } from "@effect/vitest"
import type { Event } from "aeon-types"
import * as Either from "effect/Either"
import * as fc from "effect/FastCheck"
import * as Option from "effect/Option"
import { Applicative, Covariant, type EventTypeLambda, Filterable, Monad } from "../../src/Event.js"
import { arbLeafEvent } from "../helpers/arbLeafEvent.js"
import { applicativeLaws } from "./applicativeLaws.js"
import { covariantLaws } from "./covariantLaws.js"
import { filterableLaws } from "./filterableLaws.js"
import { monadLaws } from "./monadLaws.js"

const arbNumberEvent = arbLeafEvent<number, string>({
  value: fc.integer({ min: -100, max: 100 }),
})

const arbStringEvent = arbLeafEvent<string, string>({
  value: fc.string({ maxLength: 4 }),
})

/**
 * Identity cast: `EventTypeLambda.type` is just `Event<A, E>`, so the Kind is
 * already an `Event`. Law harnesses use this to compare via `eqEvent`.
 */
const asEvent = <A, E>(fx: Event<A, E>): Event<A, E> => fx

describe("Event — Covariant laws", () => {
  covariantLaws<EventTypeLambda, number, number, number, string>({
    F: Covariant,
    arbFA: arbNumberEvent,
    arbFToB: fc.func(fc.integer({ min: -100, max: 100 })),
    arbGToC: fc.func(fc.integer({ min: -100, max: 100 })),
    asEvent,
  })
})

describe("Event — Applicative laws (combineLatest-based)", () => {
  applicativeLaws<EventTypeLambda, number, number, number, string>({
    F: Applicative,
    arbFA: arbNumberEvent,
    arbFAtoB: arbLeafEvent<(a: number) => number, string>({
      value: fc.func(fc.integer({ min: -100, max: 100 })),
    }),
    arbFBtoC: arbLeafEvent<(b: number) => number, string>({
      value: fc.func(fc.integer({ min: -100, max: 100 })),
    }),
    arbA: fc.integer({ min: -100, max: 100 }),
    arbAtoB: fc.func(fc.integer({ min: -100, max: 100 })),
    asEvent,
  })
})

describe("Event — Monad laws (mergeMap-based)", () => {
  monadLaws<EventTypeLambda, number, number, number, string>({
    M: Monad,
    arbFA: arbNumberEvent,
    arbA: fc.integer({ min: -100, max: 100 }),
    arbAToFB: fc.func(arbNumberEvent),
    arbBToFC: fc.func(arbNumberEvent),
    asEvent,
  })
})

describe("Event — Filterable laws", () => {
  const arbOptNum = fc
    .option(fc.integer({ min: -100, max: 100 }), { nil: null })
    .map((n): Option.Option<number> => (n === null ? Option.none() : Option.some(n)))
  // Either<C=string, B=number>: Right=string, Left=number
  const arbEither: fc.Arbitrary<Either.Either<string, number>> = fc.oneof(
    fc.integer({ min: -100, max: 100 }).map((n) => Either.left(n) as Either.Either<string, number>),
    fc.string({ maxLength: 4 }).map((s) => Either.right(s) as Either.Either<string, number>),
  )

  filterableLaws<number, number, string, string>({
    F: Filterable,
    arbFA: arbNumberEvent,
    arbAToOptB: fc.func(arbOptNum),
    arbBToOptC: fc.func(
      fc
        .option(fc.string({ maxLength: 4 }), { nil: null })
        .map((s): Option.Option<string> => (s === null ? Option.none() : Option.some(s))),
    ),
    arbAToEither: fc.func(arbEither),
  })
  // Keep arbStringEvent referenced to satisfy unused-import checks if
  // Filterable's Target is parameterized elsewhere.
  void arbStringEvent
})
