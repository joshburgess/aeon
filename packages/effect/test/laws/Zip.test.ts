/**
 * Law tests for the `Zip<A, E>` newtype.
 *
 * `Zip` is `Covariant` + `SemiApplicative`. Unlike the canonical `Event`
 * Applicative (which is built on `combineLatest` and is lawful), the
 * `zip`-based product cannot form a full `Applicative`: a singleton `of(x)`
 * terminates the pairwise product after one emission, breaking identity and
 * composition. So we only exercise `Covariant` + `SemiApplicative` here.
 */

import { describe } from "@effect/vitest";
import type { Event } from "aeon-types";
import * as fc from "effect/FastCheck";
import {
  Covariant,
  SemiApplicative,
  type ZipTypeLambda,
  fromEvent,
  toEvent,
} from "../../src/Event/Zip.js";
import { arbLeafEvent } from "../helpers/arbLeafEvent.js";
import { deepEqual } from "../helpers/eqEvent.js";
import { covariantLaws } from "./covariantLaws.js";
import { semiApplicativeLaws } from "./semiApplicativeLaws.js";

// `terminators: ["end"]` — restrict to error-free, well-terminated streams.
// Zip's error propagation at simultaneous ticks is not strictly equational
// across different groupings, so the SemiApplicative laws only hold over the
// error-free fragment. Canonical Event Applicative tests (combineLatest) do
// cover error behavior through its own suite.
const terminators = ["end"] as const;

const arbNumberZip = arbLeafEvent<number, string>({
  value: fc.integer({ min: -100, max: 100 }),
  terminators,
}).map(fromEvent);

const arbStringZip = arbLeafEvent<string, string>({
  value: fc.string({ maxLength: 4 }),
  terminators,
}).map(fromEvent);

const arbBoolZip = arbLeafEvent<boolean, string>({
  value: fc.boolean(),
  terminators,
}).map(fromEvent);

const asEvent = <A, E>(fx: { readonly [k: symbol]: unknown } & Event<A, E>): Event<A, E> =>
  toEvent(fx as never);

describe("Zip — Covariant laws", () => {
  covariantLaws<ZipTypeLambda, number, number, number, string>({
    F: Covariant,
    arbFA: arbNumberZip,
    arbFToB: fc.func(fc.integer({ min: -100, max: 100 })),
    arbGToC: fc.func(fc.integer({ min: -100, max: 100 })),
    asEvent,
  });
});

describe("Zip — SemiApplicative laws (zip-based)", () => {
  semiApplicativeLaws<ZipTypeLambda, number, string, boolean, string>({
    F: SemiApplicative,
    arbFA: arbNumberZip,
    arbFB: arbStringZip,
    arbFC: arbBoolZip,
    arbAToB: fc.func(fc.string({ maxLength: 4 })),
    arbBToC: fc.func(fc.boolean()),
    asEvent,
    // `product` returns nested tuples; default Object.is would never match
    // two freshly-constructed arrays, so use structural equality.
    eqOptions: { eqA: deepEqual },
  });
});
