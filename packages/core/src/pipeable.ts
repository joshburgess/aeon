/**
 * Pipeable (data-last curried) overloads for all combinators.
 *
 * Usage:
 *   pipe(event, P.map(f), P.filter(p), P.take(10))
 */

import type { Behavior, Event, Scheduler } from "@pulse/types";
import {
  liftA2B as liftA2BDirect,
  mapB as mapBDirect,
  sample as sampleDirect,
  snapshot as snapshotDirect,
} from "./behavior.js";
import { chain as chainDirect } from "./combinators/chain.js";
import { combine as combineDirect, zip as zipDirect } from "./combinators/combine.js";
import { constant as constantDirect } from "./combinators/constant.js";
import { catchError as catchErrorDirect, mapError as mapErrorDirect } from "./combinators/error.js";
import { filter as filterDirect } from "./combinators/filter.js";
import { map as mapDirect } from "./combinators/map.js";
import { merge as mergeDirect } from "./combinators/merge.js";
import { mergeMapConcurrently as mergeMapDirect } from "./combinators/mergeMap.js";
import { scan as scanDirect } from "./combinators/scan.js";
import {
  skip as skipDirect,
  skipWhile as skipWhileDirect,
  slice as sliceDirect,
  take as takeDirect,
  takeWhile as takeWhileDirect,
} from "./combinators/slice.js";
import { switchLatest as switchLatestDirect } from "./combinators/switch.js";
import { tap as tapDirect } from "./combinators/tap.js";
import {
  drain as drainDirect,
  observe as observeDirect,
  reduce as reduceDirect,
} from "./combinators/terminal.js";

// --- Event operators ---

export const map =
  <A, B>(f: (a: A) => B) =>
  <E>(event: Event<A, E>): Event<B, E> =>
    mapDirect(f, event);

export const filter =
  <A>(predicate: (a: A) => boolean) =>
  <E>(event: Event<A, E>): Event<A, E> =>
    filterDirect(predicate, event);

export const tap =
  <A>(f: (a: A) => void) =>
  <E>(event: Event<A, E>): Event<A, E> =>
    tapDirect(f, event);

export const constant =
  <B>(value: B) =>
  <A, E>(event: Event<A, E>): Event<B, E> =>
    constantDirect(value, event);

export const scan =
  <A, B>(f: (acc: B, a: A) => B, seed: B) =>
  <E>(event: Event<A, E>): Event<B, E> =>
    scanDirect(f, seed, event);

export const take =
  (n: number) =>
  <A, E>(event: Event<A, E>): Event<A, E> =>
    takeDirect(n, event);

export const skip =
  (n: number) =>
  <A, E>(event: Event<A, E>): Event<A, E> =>
    skipDirect(n, event);

export const takeWhile =
  <A>(predicate: (a: A) => boolean) =>
  <E>(event: Event<A, E>): Event<A, E> =>
    takeWhileDirect(predicate, event);

export const skipWhile =
  <A>(predicate: (a: A) => boolean) =>
  <E>(event: Event<A, E>): Event<A, E> =>
    skipWhileDirect(predicate, event);

export const slice =
  (start: number, end: number) =>
  <A, E>(event: Event<A, E>): Event<A, E> =>
    sliceDirect(start, end, event);

export const chain =
  <A, B, E>(f: (a: A) => Event<B, E>) =>
  (event: Event<A, E>): Event<B, E> =>
    chainDirect(f, event);

export const mergeMapConcurrently =
  <A, B, E>(f: (a: A) => Event<B, E>, concurrency: number) =>
  (event: Event<A, E>): Event<B, E> =>
    mergeMapDirect(f, concurrency, event);

export const catchError =
  <A, E1, E2>(handler: (err: E1) => Event<A, E2>) =>
  (event: Event<A, E1>): Event<A, E2> =>
    catchErrorDirect(handler, event);

export const mapError =
  <E1, E2>(f: (err: E1) => E2) =>
  <A>(event: Event<A, E1>): Event<A, E2> =>
    mapErrorDirect(f, event);

// --- Behavior operators ---

export const sample =
  <A, E>(behavior: Behavior<A, E>) =>
  <B>(sampler: Event<B, E>): Event<A, E> =>
    sampleDirect(behavior, sampler);

export const snapshot =
  <A, B, C, E>(f: (a: A, b: B) => C, behavior: Behavior<A, E>) =>
  (event: Event<B, E>): Event<C, E> =>
    snapshotDirect(f, behavior, event);
