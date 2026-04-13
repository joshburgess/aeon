/**
 * Example 01 — Using aeon-effect's typeclass instances.
 *
 * Demonstrates Covariant (map), Applicative (product/zipWith via combineLatest),
 * and Monad (flatMap via mergeMap(Infinity)) on aeon-core's `Event<A, E>`,
 * driven through @effect/typeclass's polymorphic operators.
 *
 * Run:   pnpm ex:typeclasses
 */

import * as SemiApplicative from "@effect/typeclass/SemiApplicative";
import { map as coreMap, observe, periodic, take } from "aeon-core";
import { Applicative, Covariant, Monad } from "aeon-effect/Event";
import { DefaultScheduler } from "aeon-scheduler";
import { toDuration } from "aeon-types";

const scheduler = new DefaultScheduler();

const log = (label: string) => (value: unknown) => console.log(`[${label}]`, JSON.stringify(value));

// A small helper: a finite ticking stream of numbers 0..n-1, spaced by `ms`.
const ticks = (n: number, ms: number) => {
  let i = 0;
  return take(
    n,
    coreMap(() => i++, periodic(toDuration(ms))),
  );
};

// --- Covariant.map ------------------------------------------------------------
// `Covariant.map` uses the same `map` as aeon-core, just via the typeclass
// instance. Nothing surprising — this is the baseline.
console.log("\n--- Covariant.map ---");
await observe(
  log("doubled"),
  Covariant.map(ticks(3, 10), (n) => n * 2),
  scheduler,
);

// --- Monad.flatMap ------------------------------------------------------------
// Canonical `Monad` uses `mergeMap(Infinity)` — inners run concurrently and
// their outputs interleave in arrival order. Here each outer tick spawns a
// mini-stream of three values; with `mergeMap`, values from later outers
// overlap with tails from earlier ones.
console.log("\n--- Monad.flatMap (concurrent, mergeMap) ---");
await observe(
  log("flatMap"),
  Monad.flatMap(ticks(2, 20), (n) => Covariant.map(ticks(3, 5), (k) => `${n}.${k}`)),
  scheduler,
);

// --- Applicative.product via zipWith ------------------------------------------
// `SemiApplicative.zipWith` is derived generically from `product` + `map`.
// For aeon-effect's canonical Applicative, `product` is `combineLatest`, so
// each emission from either side pairs with the OTHER side's most-recent
// value. That's why you see more than `min(|a|, |b|)` entries here.
console.log("\n--- Applicative.zipWith via SemiApplicative (combineLatest) ---");
const zipWith = SemiApplicative.zipWith(Applicative);
await observe(
  log("pair"),
  zipWith(ticks(4, 10), ticks(3, 15), (a, b) => [a, b]),
  scheduler,
);
