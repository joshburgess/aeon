/**
 * `Zip<A, E>` — phantom newtype wrapping `Event<A, E>` with pairwise
 * applicative-style combinators built on aeon-core's `zip`.
 *
 * Why a newtype? The canonical `Applicative` on `Event` (see `aeon-effect/Event`)
 * is built on `combineLatest`, because that's the lawful choice — `of(x)`
 * pairs correctly with every downstream emission. `zip` can't form a lawful
 * `Applicative` for discrete streams (a singleton `of` terminates the
 * pairwise product after one emission, breaking identity and composition).
 * So `zip` is exposed here as `SemiApplicative` + `Covariant` only, under
 * a distinct nominal type so TypeScript won't accidentally mix the two.
 *
 * Converts: `fromEvent` / `toEvent` are pure casts — the wire representation
 * is identical to the underlying `Event`.
 */

import { dual } from "effect/Function"
import type { TypeLambda } from "effect/HKT"

import { map as coreMap, zip as coreZip } from "aeon-core"
import type { Event } from "aeon-types"

import * as covariant from "@effect/typeclass/Covariant"
import type * as invariant from "@effect/typeclass/Invariant"
import type * as semiApplicative from "@effect/typeclass/SemiApplicative"
import type * as semiProduct from "@effect/typeclass/SemiProduct"

declare const ZipBrand: unique symbol

/**
 * `Event` endowed with a pairwise (`zip`-based) semi-applicative structure.
 * Values alternate 1:1 between the two sides of every `product`.
 */
export type Zip<A, E = never> = Event<A, E> & { readonly [ZipBrand]: unique symbol }

/** Wrap an `Event` as a `Zip`. Pure cast; no runtime cost. */
export const fromEvent = <A, E>(event: Event<A, E>): Zip<A, E> => event as Zip<A, E>

/** Unwrap a `Zip` back to the underlying `Event`. Pure cast. */
export const toEvent = <A, E>(zip: Zip<A, E>): Event<A, E> => zip as Event<A, E>

/**
 * TypeLambda for `Zip`. Structurally identical to `EventTypeLambda` but
 * nominally distinct, so typeclass instances don't cross-apply.
 */
export interface ZipTypeLambda extends TypeLambda {
  readonly type: Zip<this["Target"], this["Out1"]>
}

// --- operations ---

const map: {
  <A, B>(f: (a: A) => B): <E>(self: Zip<A, E>) => Zip<B, E>
  <A, B, E>(self: Zip<A, E>, f: (a: A) => B): Zip<B, E>
} = dual(
  2,
  <A, B, E>(self: Zip<A, E>, f: (a: A) => B): Zip<B, E> => fromEvent(coreMap(f, toEvent(self))),
)

const product = <A, B, E1, E2>(self: Zip<A, E1>, that: Zip<B, E2>): Zip<[A, B], E1 | E2> =>
  fromEvent(coreZip(toEvent(self) as Event<A, E1 | E2>, toEvent(that) as Event<B, E1 | E2>))

const productMany = <A, E>(
  self: Zip<A, E>,
  collection: Iterable<Zip<A, E>>,
): Zip<[A, ...A[]], E> => {
  let acc: Zip<A[], E> = map(self, (a: A) => [a])
  for (const next of collection) {
    acc = map(product(acc, next), ([arr, b]: [A[], A]) => [...arr, b])
  }
  return acc as unknown as Zip<[A, ...A[]], E>
}

// --- instances ---

const imap = covariant.imap<ZipTypeLambda>(map)

export const Covariant: covariant.Covariant<ZipTypeLambda> = {
  imap,
  map,
}

export const Invariant: invariant.Invariant<ZipTypeLambda> = {
  imap,
}

export const SemiProduct: semiProduct.SemiProduct<ZipTypeLambda> = {
  imap,
  product,
  productMany,
}

export const SemiApplicative: semiApplicative.SemiApplicative<ZipTypeLambda> = {
  imap,
  map,
  product,
  productMany,
}
