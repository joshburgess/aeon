/**
 * Law tests for the `Sequential<A, E>` newtype.
 *
 * `Sequential` provides a `Monad` instance built on aeon-core's `chain`
 * (`concatMap` — inner streams run to completion sequentially, no
 * interleaving), in contrast to the canonical `Event` monad which uses
 * `mergeMap(Infinity)`. Both are lawful; we exercise covariant + monad laws.
 */

import { describe } from "@effect/vitest"
import { toTime } from "aeon-types"
import type { Event } from "aeon-types"
import * as fc from "effect/FastCheck"
import {
  Covariant,
  Monad,
  type SequentialTypeLambda,
  fromEvent,
  toEvent,
} from "../../src/Event/Sequential.js"
import { arbLeafEvent } from "../helpers/arbLeafEvent.js"
import { eqEventSeq } from "../helpers/eqEvent.js"
import { covariantLaws } from "./covariantLaws.js"
import { monadLaws } from "./monadLaws.js"

// `terminators: ["end"]` — chain stalls if an inner never ends, and its
// error handling is not strictly equational across flatMap restructurings
// (aeon-core's chain forwards outer errors while an inner is still running,
// so total error counts differ between `flatMap(flatMap(m,f), g)` and
// `flatMap(m, a => flatMap(f(a), g))`). Testing laws over the error-free
// fragment is the standard approach.
//
// Tight `horizon` (100) and `maxLength` (4) keep **compounded** time bounded:
// chain-based flatMap serializes inners, so `flatMap(flatMap(m,f),g)` vs
// `flatMap(m, a => flatMap(f(a), g))` can stack delays differently, and the
// difference grows as O(|m|·|f(a)|·max-delay). With these bounds both nestings
// finish well under the 100_000 equality horizon below.
const LEAF_HORIZON = 100
const LEAF_MAX = 4
const arbNumberSeq = arbLeafEvent<number, string>({
  value: fc.integer({ min: -100, max: 100 }),
  terminators: ["end"],
  horizon: LEAF_HORIZON,
  maxLength: LEAF_MAX,
}).map(fromEvent)

// Compounded chain timings can push end-of-stream past the default 10k
// horizon; use a much larger horizon so both LHS and RHS of associativity
// actually run to completion and are compared on equal footing.
const EQ_HORIZON = toTime(100_000)

const asEvent = <A, E>(fx: { readonly [k: symbol]: unknown } & Event<A, E>): Event<A, E> =>
  toEvent(fx as never)

describe("Sequential — Covariant laws", () => {
  covariantLaws<SequentialTypeLambda, number, number, number, string>({
    F: Covariant,
    arbFA: arbNumberSeq,
    arbFToB: fc.func(fc.integer({ min: -100, max: 100 })),
    arbGToC: fc.func(fc.integer({ min: -100, max: 100 })),
    asEvent,
  })
})

describe("Sequential — Monad laws (chain-based)", () => {
  monadLaws<SequentialTypeLambda, number, number, number, string>({
    M: Monad,
    arbFA: arbNumberSeq,
    arbA: fc.integer({ min: -100, max: 100 }),
    arbAToFB: fc.func(arbNumberSeq),
    arbBToFC: fc.func(arbNumberSeq),
    asEvent,
    eqOptions: { horizon: EQ_HORIZON },
    // Chain-based timed monads satisfy associativity only up to the
    // ordered event sequence, not pointwise timing: different nestings
    // interleave "next outer start" with "current inner's downstream"
    // differently, shifting end times. See `eqEventSeq` for the
    // sequence-only equality used here.
    eqAssoc: (a, b) => eqEventSeq(a, b, { horizon: EQ_HORIZON }),
  })
})
