/**
 * Canonical @effect/typeclass instances over aeon-core's `Event<A, E>`.
 *
 * Choice of canonical instances (v0):
 *   - Applicative: `combineLatest`-based. Lawful because `of(x) = now(x)`
 *     emits x at t=0 and combineLatest holds it as "latest" forever, so
 *     `ap(of(id), v) ≡ v` as required by the identity law. The `zip`
 *     (pairwise) flavour is a `SemiApplicative` only — it has no lawful
 *     `of`, because a single-emission event cannot serve as identity for
 *     a shorter-stream-wins operator. `zip` lives behind a newtype in
 *     `Event/Zip` for callers who want its pairwise semantics.
 *   - Monad: `mergeMap(Infinity)`-based (fully concurrent). The `concatMap`
 *     variant (sequential, preserves inner order) lives in `Event/Sequential`.
 *   - Filterable: composed from `map` + `filter` over `Option` / `Either`.
 *
 * All instances operate on the aeon-core runtime directly — no Stream hop.
 */

import * as Either from "effect/Either";
import { dual } from "effect/Function";
import type { TypeLambda } from "effect/HKT";
import * as Option from "effect/Option";

import {
  combine as coreCombine,
  filter as coreFilter,
  map as coreMap,
  mergeMap as coreMergeMap,
  now,
} from "aeon-core";
import type { Event } from "aeon-types";

import type * as applicative from "@effect/typeclass/Applicative";
import * as covariant from "@effect/typeclass/Covariant";
import type * as filterable from "@effect/typeclass/Filterable";
import type * as flatMap_ from "@effect/typeclass/FlatMap";
import type * as invariant from "@effect/typeclass/Invariant";
import type * as monad from "@effect/typeclass/Monad";
import type * as of_ from "@effect/typeclass/Of";
import type * as pointed from "@effect/typeclass/Pointed";
import type * as product_ from "@effect/typeclass/Product";
import type * as semiApplicative from "@effect/typeclass/SemiApplicative";
import type * as semiProduct from "@effect/typeclass/SemiProduct";

/**
 * TypeLambda mapping aeon's `Event<A, E>` into Effect's 4-slot HKT shape.
 *
 *   Target  (A) — emitted value type
 *   Out1    (E) — error channel type
 *   In, Out2    — unused (fixed to `never`)
 */
export interface EventTypeLambda extends TypeLambda {
  readonly type: Event<this["Target"], this["Out1"]>;
}

// --- raw operations, dualized ---

const of = <A>(a: A): Event<A, never> => now(a);

const map: {
  <A, B>(f: (a: A) => B): <E>(self: Event<A, E>) => Event<B, E>;
  <A, B, E>(self: Event<A, E>, f: (a: A) => B): Event<B, E>;
} = dual(2, <A, B, E>(self: Event<A, E>, f: (a: A) => B): Event<B, E> => coreMap(f, self));

const flatMap: {
  <A, B, E2>(f: (a: A) => Event<B, E2>): <E1>(self: Event<A, E1>) => Event<B, E1 | E2>;
  <A, B, E1, E2>(self: Event<A, E1>, f: (a: A) => Event<B, E2>): Event<B, E1 | E2>;
} = dual(
  2,
  <A, B, E1, E2>(self: Event<A, E1>, f: (a: A) => Event<B, E2>): Event<B, E1 | E2> =>
    coreMergeMap(
      f as (a: A) => Event<B, E1 | E2>,
      Number.POSITIVE_INFINITY,
      self as Event<A, E1 | E2>,
    ),
);

const product = <A, B, E1, E2>(self: Event<A, E1>, that: Event<B, E2>): Event<[A, B], E1 | E2> =>
  coreCombine((a: A, b: B): [A, B] => [a, b], self as Event<A, E1 | E2>, that as Event<B, E1 | E2>);

const productMany = <A, E>(
  self: Event<A, E>,
  collection: Iterable<Event<A, E>>,
): Event<[A, ...A[]], E> => {
  let acc: Event<A[], E> = coreMap((a: A) => [a], self);
  for (const next of collection) {
    acc = coreCombine((arr: A[], b: A) => [...arr, b], acc, next);
  }
  return acc as unknown as Event<[A, ...A[]], E>;
};

const productAll = <A, E>(collection: Iterable<Event<A, E>>): Event<A[], E> => {
  const iter = collection[Symbol.iterator]();
  const first = iter.next();
  if (first.done) return now<A[]>([]);
  let acc: Event<A[], E> = coreMap((a: A) => [a], first.value);
  for (let next = iter.next(); !next.done; next = iter.next()) {
    acc = coreCombine((arr: A[], b: A) => [...arr, b], acc, next.value);
  }
  return acc;
};

// --- Filterable (composed from map + filter) ---

const filterMap: {
  <A, B>(f: (a: A) => Option.Option<B>): <E>(self: Event<A, E>) => Event<B, E>;
  <A, B, E>(self: Event<A, E>, f: (a: A) => Option.Option<B>): Event<B, E>;
} = dual(2, <A, B, E>(self: Event<A, E>, f: (a: A) => Option.Option<B>): Event<B, E> => {
  const mapped = coreMap(f, self);
  const filtered = coreFilter((o: Option.Option<B>) => Option.isSome(o), mapped);
  return coreMap((o: Option.Option<B>) => (o as Option.Some<B>).value, filtered);
});

const partitionMap: {
  <A, B, C>(f: (a: A) => Either.Either<C, B>): <E>(self: Event<A, E>) => [Event<B, E>, Event<C, E>];
  <A, B, C, E>(self: Event<A, E>, f: (a: A) => Either.Either<C, B>): [Event<B, E>, Event<C, E>];
} = dual(
  2,
  <A, B, C, E>(self: Event<A, E>, f: (a: A) => Either.Either<C, B>): [Event<B, E>, Event<C, E>] => {
    // Two independent subscriptions to `self` — `f` runs twice.
    // Acceptable for v0; revisit with `share`/`multicast` if measured hot.
    const left = filterMap(self, (a: A) => Either.getLeft(f(a)));
    const right = filterMap(self, (a: A) => Either.getRight(f(a)));
    return [left, right];
  },
);

// --- Typeclass instances ---

const imap = covariant.imap<EventTypeLambda>(map);

export const Covariant: covariant.Covariant<EventTypeLambda> = {
  imap,
  map,
};

export const Invariant: invariant.Invariant<EventTypeLambda> = {
  imap,
};

export const Of: of_.Of<EventTypeLambda> = {
  of,
};

export const Pointed: pointed.Pointed<EventTypeLambda> = {
  of,
  imap,
  map,
};

export const FlatMap: flatMap_.FlatMap<EventTypeLambda> = {
  flatMap,
};

export const Monad: monad.Monad<EventTypeLambda> = {
  of,
  imap,
  map,
  flatMap,
};

export const SemiProduct: semiProduct.SemiProduct<EventTypeLambda> = {
  imap,
  product,
  productMany,
};

export const Product: product_.Product<EventTypeLambda> = {
  imap,
  of,
  product,
  productMany,
  productAll,
};

export const SemiApplicative: semiApplicative.SemiApplicative<EventTypeLambda> = {
  imap,
  map,
  product,
  productMany,
};

export const Applicative: applicative.Applicative<EventTypeLambda> = {
  imap,
  of,
  map,
  product,
  productMany,
  productAll,
};

export const Filterable: filterable.Filterable<EventTypeLambda> = {
  filterMap,
  partitionMap,
};
