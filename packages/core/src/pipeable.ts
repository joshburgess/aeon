/**
 * Pipeable (data-last curried) overloads for all combinators.
 *
 * Usage:
 *   pipe(event, P.map(f), P.filter(p), P.take(10))
 */

import type { Behavior, Duration, Event, Scheduler } from "@pulse/types";
import {
  derivative as derivativeDirect,
  integral as integralDirect,
  liftA2B as liftA2BDirect,
  mapB as mapBDirect,
  sample as sampleDirect,
  snapshot as snapshotDirect,
  switchB as switchBDirect,
} from "./behavior.js";
import { chain as chainDirect } from "./combinators/chain.js";
import { combine as combineDirect, zip as zipDirect } from "./combinators/combine.js";
import { constant as constantDirect } from "./combinators/constant.js";
import { catchError as catchErrorDirect, mapError as mapErrorDirect } from "./combinators/error.js";
import { filter as filterDirect } from "./combinators/filter.js";
import { map as mapDirect } from "./combinators/map.js";
import { mapAsync as mapAsyncDirect } from "./combinators/mapAsync.js";
import { merge as mergeDirect } from "./combinators/merge.js";
import { mergeMapConcurrently as mergeMapDirect } from "./combinators/mergeMap.js";
import { retry as retryDirect } from "./combinators/retry.js";
import { scan as scanDirect } from "./combinators/scan.js";
import { share as shareDirect } from "./combinators/share.js";
import {
  since as sinceDirect,
  skip as skipDirect,
  skipWhile as skipWhileDirect,
  slice as sliceDirect,
  take as takeDirect,
  takeWhile as takeWhileDirect,
  until as untilDirect,
} from "./combinators/slice.js";
import { switchLatest as switchLatestDirect } from "./combinators/switch.js";
import { tap as tapDirect } from "./combinators/tap.js";
import {
  drain as drainDirect,
  observe as observeDirect,
  reduce as reduceDirect,
} from "./combinators/terminal.js";
import {
  bufferCount as bufferCountDirect,
  bufferTime as bufferTimeDirect,
  debounce as debounceDirect,
  delay as delayDirect,
  throttle as throttleDirect,
} from "./combinators/time.js";
import { withLatestFrom as withLatestFromDirect } from "./combinators/withLatestFrom.js";

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

export const mapAsync =
  <A, B>(f: (a: A) => Promise<B>, concurrency: number) =>
  <E>(event: Event<A, E>): Event<B, E> =>
    mapAsyncDirect(f, concurrency, event);

export const switchLatest = <A, E>(event: Event<Event<A, E>, E>): Event<A, E> =>
  switchLatestDirect(event);

export const retry =
  (maxRetries: number, delay?: Duration) =>
  <A, E>(event: Event<A, E>): Event<A, E> =>
    retryDirect(maxRetries, event, delay);

export const share =
  (bufferSize: number) =>
  <A, E>(event: Event<A, E>): Event<A, E> =>
    shareDirect(bufferSize, event);

export const withLatestFrom =
  <A, B, C, E>(f: (a: A, b: B) => C, sampled: Event<A, E>) =>
  (sampler: Event<B, E>): Event<C, E> =>
    withLatestFromDirect(f, sampled, sampler);

export const until =
  <E>(signal: Event<unknown, E>) =>
  <A>(event: Event<A, E>): Event<A, E> =>
    untilDirect(signal, event);

export const since =
  <E>(signal: Event<unknown, E>) =>
  <A>(event: Event<A, E>): Event<A, E> =>
    sinceDirect(signal, event);

// --- Time operators ---

export const debounce =
  (duration: Duration) =>
  <A, E>(event: Event<A, E>): Event<A, E> =>
    debounceDirect(duration, event);

export const throttle =
  (duration: Duration) =>
  <A, E>(event: Event<A, E>): Event<A, E> =>
    throttleDirect(duration, event);

export const delay =
  (duration: Duration) =>
  <A, E>(event: Event<A, E>): Event<A, E> =>
    delayDirect(duration, event);

export const bufferCount =
  (count: number) =>
  <A, E>(event: Event<A, E>): Event<A[], E> =>
    bufferCountDirect(count, event);

export const bufferTime =
  (duration: Duration) =>
  <A, E>(event: Event<A, E>): Event<A[], E> =>
    bufferTimeDirect(duration, event);

// --- Terminal operators ---

export const reduce =
  <A, B>(f: (acc: B, a: A) => B, seed: B, scheduler: Scheduler) =>
  <E>(event: Event<A, E>): Promise<B> =>
    reduceDirect(f, seed, event, scheduler);

export const observe =
  <A>(f: (a: A) => void, scheduler: Scheduler) =>
  <E>(event: Event<A, E>): Promise<void> =>
    observeDirect(f, event, scheduler);

export const drain =
  (scheduler: Scheduler) =>
  <A, E>(event: Event<A, E>): Promise<void> =>
    drainDirect(event, scheduler);

// --- Behavior operators ---

export const mapB =
  <A, B>(f: (a: A) => B) =>
  <E>(behavior: Behavior<A, E>): Behavior<B, E> =>
    mapBDirect(f, behavior);

export const sample =
  <A, E>(behavior: Behavior<A, E>) =>
  <B>(sampler: Event<B, E>): Event<A, E> =>
    sampleDirect(behavior, sampler);

export const snapshot =
  <A, B, C, E>(f: (a: A, b: B) => C, behavior: Behavior<A, E>) =>
  (event: Event<B, E>): Event<C, E> =>
    snapshotDirect(f, behavior, event);

export const integral =
  (dt: Duration) =>
  (behavior: Behavior<number, never>): Behavior<number, never> =>
    integralDirect(behavior, dt);

export const derivative =
  (dt: Duration) =>
  (behavior: Behavior<number, never>): Behavior<number, never> =>
    derivativeDirect(behavior, dt);

export const switchB = <A, E>(bb: Behavior<Behavior<A, E>, E>): Behavior<A, E> => switchBDirect(bb);
