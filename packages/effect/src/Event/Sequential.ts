/**
 * `Sequential<A, E>` — phantom newtype wrapping `Event<A, E>` with a
 * `concatMap`-based `Monad` instance.
 *
 * Why a newtype? The canonical `Monad` on `Event` (see `aeon-effect/Event`)
 * uses `mergeMap(Infinity)` — inner streams run concurrently, outputs are
 * interleaved in time. That choice maximises throughput but loses
 * sequential-run semantics: the second inner begins before the first ends.
 *
 * `Sequential` uses `chain`, aeon-core's sequential flatMap: one inner
 * stream runs to completion before the next begins. Useful when callers
 * need ordered traversal semantics — e.g. "for each URL, fetch then parse,
 * and never interleave the fetches."
 *
 * Like `Zip`, `fromEvent` / `toEvent` are pure casts.
 */

import { dual } from "effect/Function"
import type { TypeLambda } from "effect/HKT"

import { chain as coreChain, map as coreMap, now } from "aeon-core"
import type { Event } from "aeon-types"

import * as covariant from "@effect/typeclass/Covariant"
import type * as flatMap_ from "@effect/typeclass/FlatMap"
import type * as invariant from "@effect/typeclass/Invariant"
import type * as monad from "@effect/typeclass/Monad"
import type * as of_ from "@effect/typeclass/Of"
import type * as pointed from "@effect/typeclass/Pointed"

declare const SequentialBrand: unique symbol

/**
 * `Event` endowed with sequential (`concatMap`-based) monadic structure.
 * Inner streams run to completion in order; no interleaving.
 */
export type Sequential<A, E = never> = Event<A, E> & {
  readonly [SequentialBrand]: unique symbol
}

/** Wrap an `Event` as a `Sequential`. Pure cast; no runtime cost. */
export const fromEvent = <A, E>(event: Event<A, E>): Sequential<A, E> => event as Sequential<A, E>

/** Unwrap a `Sequential` back to the underlying `Event`. Pure cast. */
export const toEvent = <A, E>(seq: Sequential<A, E>): Event<A, E> => seq as Event<A, E>

/**
 * TypeLambda for `Sequential`. Structurally identical to `EventTypeLambda`
 * but nominally distinct.
 */
export interface SequentialTypeLambda extends TypeLambda {
  readonly type: Sequential<this["Target"], this["Out1"]>
}

// --- operations ---

const of = <A>(a: A): Sequential<A, never> => fromEvent(now(a))

const map: {
  <A, B>(f: (a: A) => B): <E>(self: Sequential<A, E>) => Sequential<B, E>
  <A, B, E>(self: Sequential<A, E>, f: (a: A) => B): Sequential<B, E>
} = dual(
  2,
  <A, B, E>(self: Sequential<A, E>, f: (a: A) => B): Sequential<B, E> =>
    fromEvent(coreMap(f, toEvent(self))),
)

const flatMap: {
  <A, B, E2>(
    f: (a: A) => Sequential<B, E2>,
  ): <E1>(self: Sequential<A, E1>) => Sequential<B, E1 | E2>
  <A, B, E1, E2>(self: Sequential<A, E1>, f: (a: A) => Sequential<B, E2>): Sequential<B, E1 | E2>
} = dual(
  2,
  <A, B, E1, E2>(self: Sequential<A, E1>, f: (a: A) => Sequential<B, E2>): Sequential<B, E1 | E2> =>
    fromEvent(
      coreChain((a: A) => toEvent(f(a)) as Event<B, E1 | E2>, toEvent(self) as Event<A, E1 | E2>),
    ),
)

// --- instances ---

const imap = covariant.imap<SequentialTypeLambda>(map)

export const Covariant: covariant.Covariant<SequentialTypeLambda> = {
  imap,
  map,
}

export const Invariant: invariant.Invariant<SequentialTypeLambda> = {
  imap,
}

export const Of: of_.Of<SequentialTypeLambda> = {
  of,
}

export const Pointed: pointed.Pointed<SequentialTypeLambda> = {
  of,
  imap,
  map,
}

export const FlatMap: flatMap_.FlatMap<SequentialTypeLambda> = {
  flatMap,
}

export const Monad: monad.Monad<SequentialTypeLambda> = {
  of,
  imap,
  map,
  flatMap,
}
