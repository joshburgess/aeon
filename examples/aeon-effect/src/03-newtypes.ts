/**
 * Example 03 — Zip and Sequential newtypes.
 *
 * aeon-effect's canonical typeclass instances pick one lawful semantics
 * per operation: Applicative is `combineLatest` (lawful `of`), and Monad
 * is `mergeMap(Infinity)` (fully concurrent inners). The other semantics
 * are still useful and still lawful — they live behind nominal newtypes
 * so callers opt in explicitly.
 *
 *   `Zip<A, E>`        — SemiApplicative via pairwise `zip` (no lawful `of`)
 *   `Sequential<A, E>` — Monad via `chain` (concatMap, sequential inners)
 *
 * Run:   pnpm ex:newtypes
 */

import * as SemiApplicative from "@effect/typeclass/SemiApplicative";
import { map as coreMap, observe, periodic, take } from "aeon-core";
import { Applicative as CanonicalApplicative, Monad as CanonicalMonad } from "aeon-effect/Event";
import {
  Monad as SequentialMonad,
  fromEvent as fromEventSeq,
  toEvent as toEventSeq,
} from "aeon-effect/Event/Sequential";
import {
  SemiApplicative as ZipSemiApplicative,
  fromEvent as fromEventZip,
  toEvent as toEventZip,
} from "aeon-effect/Event/Zip";
import { DefaultScheduler } from "aeon-scheduler";
import { toDuration } from "aeon-types";

const scheduler = new DefaultScheduler();

// Helper: n ticks spaced by ms, emitting 0..n-1.
const ticks = (n: number, ms: number) => {
  let i = 0;
  return take(
    n,
    coreMap(() => i++, periodic(toDuration(ms))),
  );
};

// --- combineLatest vs zip -----------------------------------------------------
// Canonical `Applicative.product` is combineLatest: each emission from either
// side pairs with the OTHER side's latest value. `Zip`'s `SemiApplicative.product`
// is pairwise zip: the i-th emission on the left pairs only with the i-th
// emission on the right, so the output length is `min(|a|, |b|)`.
console.log("\n--- combineLatest (canonical) vs zip (newtype) ---");

const canonZipWith = SemiApplicative.zipWith(CanonicalApplicative);
const zipZipWith = SemiApplicative.zipWith(ZipSemiApplicative);

console.log("[combineLatest]");
await observe(
  (v) => console.log("  ", JSON.stringify(v)),
  canonZipWith(ticks(4, 10), ticks(3, 15), (a, b) => [a, b] as const),
  scheduler,
);

console.log("[zip]");
{
  const left = fromEventZip(ticks(4, 10));
  const right = fromEventZip(ticks(3, 15));
  await observe(
    (v) => console.log("  ", JSON.stringify(v)),
    toEventZip(zipZipWith(left, right, (a, b) => [a, b] as const)),
    scheduler,
  );
}

// --- mergeMap vs chain --------------------------------------------------------
// Canonical `Monad.flatMap` is mergeMap(Infinity): each outer value starts
// an inner stream, and all inners emit concurrently. `Sequential.flatMap`
// is chain: each inner runs to completion before the next outer value is
// consumed. With outer-tick spacing smaller than inner-stream duration, the
// difference is visible: mergeMap interleaves; chain serializes.
console.log("\n--- mergeMap (canonical) vs chain (Sequential newtype) ---");

const outer = () => ticks(2, 20); // outer values 0, 1 at t=20, 40
const inner = (n: number) => {
  let j = 0;
  return take(
    3,
    coreMap(() => `${n}.${j++}`, periodic(toDuration(15))),
  );
};

console.log("[mergeMap] (concurrent)");
await observe((v) => console.log("  ", v), CanonicalMonad.flatMap(outer(), inner), scheduler);

console.log("[Sequential.chain] (serial)");
{
  const program = SequentialMonad.flatMap(fromEventSeq(outer()), (n: number) =>
    fromEventSeq(inner(n)),
  );
  await observe((v) => console.log("  ", v), toEventSeq(program), scheduler);
}
