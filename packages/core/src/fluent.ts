/**
 * Fluent API wrapper for Event streams.
 *
 * Provides a chainable interface: `fluent(event).map(f).filter(p).take(10)`
 * All methods delegate to standalone combinators — zero logic duplication.
 *
 * This is a separate entry point so tree-shaking eliminates it when unused.
 */

import type { Behavior, Duration, Event, Scheduler } from "aeon-types";
import { toAsyncIterator } from "./asyncIterator.js";
import { sample, snapshot } from "./behavior.js";
import { all, count, elementAt } from "./combinators/aggregate.js";
import { attach } from "./combinators/attach.js";
import { chain } from "./combinators/chain.js";
import { combine, zip } from "./combinators/combine.js";
import { cons } from "./combinators/cons.js";
import { constant } from "./combinators/constant.js";
import { dedupe } from "./combinators/dedupe.js";
import { ensure } from "./combinators/ensure.js";
import { catchError, mapError } from "./combinators/error.js";
import { exhaustMap } from "./combinators/exhaustMap.js";
import { filter } from "./combinators/filter.js";
import { first, last } from "./combinators/firstLast.js";
import { map } from "./combinators/map.js";
import { merge } from "./combinators/merge.js";
import { mergeMap as mergeMapDirect } from "./combinators/mergeMap.js";
import { orElse } from "./combinators/orElse.js";
import { pairwise } from "./combinators/pairwise.js";
import { race } from "./combinators/race.js";
import { retry } from "./combinators/retry.js";
import { scan } from "./combinators/scan.js";
import { share } from "./combinators/share.js";
import { drop, dropWhile, since, slice, take, takeWhile, until } from "./combinators/slice.js";
import { switchLatest } from "./combinators/switch.js";
import { tap } from "./combinators/tap.js";
import { drain, observe, reduce } from "./combinators/terminal.js";
import { bufferCount, bufferTime, debounce, delay, throttle } from "./combinators/time.js";
import { timeout } from "./combinators/timeout.js";
import { traverse } from "./combinators/traverse.js";
import { multicast } from "./multicast.js";

/**
 * Chainable wrapper around a pulse Event.
 *
 * Every method returns a new FluentEvent (or a terminal value like Promise).
 * The underlying Event is accessible via `.event`.
 */
export class FluentEvent<A, E> {
  declare readonly event: Event<A, E>;

  constructor(event: Event<A, E>) {
    this.event = event;
  }

  // --- Functor / Transform ---

  map<B>(f: (a: A) => B): FluentEvent<B, E> {
    return new FluentEvent(map(f, this.event));
  }

  filter(predicate: (a: A) => boolean): FluentEvent<A, E> {
    return new FluentEvent(filter(predicate, this.event));
  }

  tap(f: (a: A) => void): FluentEvent<A, E> {
    return new FluentEvent(tap(f, this.event));
  }

  constant<B>(value: B): FluentEvent<B, E> {
    return new FluentEvent(constant(value, this.event));
  }

  scan<B>(f: (acc: B, a: A) => B, seed: B): FluentEvent<B, E> {
    return new FluentEvent(scan(f, seed, this.event));
  }

  dedupe(eq?: (a: A, b: A) => boolean): FluentEvent<A, E> {
    return new FluentEvent(dedupe(this.event, eq));
  }

  cons(value: A): FluentEvent<A, E> {
    return new FluentEvent(cons(value, this.event));
  }

  pairwise(): FluentEvent<[A, A], E> {
    return new FluentEvent(pairwise(this.event));
  }

  first(predicate?: (a: A) => boolean): FluentEvent<A, E> {
    return new FluentEvent(first(this.event, predicate));
  }

  last(predicate?: (a: A) => boolean): FluentEvent<A, E> {
    return new FluentEvent(last(this.event, predicate));
  }

  // --- Slicing ---

  take(n: number): FluentEvent<A, E> {
    return new FluentEvent(take(n, this.event));
  }

  drop(n: number): FluentEvent<A, E> {
    return new FluentEvent(drop(n, this.event));
  }

  takeWhile(predicate: (a: A) => boolean): FluentEvent<A, E> {
    return new FluentEvent(takeWhile(predicate, this.event));
  }

  dropWhile(predicate: (a: A) => boolean): FluentEvent<A, E> {
    return new FluentEvent(dropWhile(predicate, this.event));
  }

  slice(start: number, end: number): FluentEvent<A, E> {
    return new FluentEvent(slice(start, end, this.event));
  }

  until(signal: Event<unknown, E>): FluentEvent<A, E> {
    return new FluentEvent(until(signal, this.event));
  }

  since(signal: Event<unknown, E>): FluentEvent<A, E> {
    return new FluentEvent(since(signal, this.event));
  }

  // --- Combining ---

  merge(...others: Event<A, E>[]): FluentEvent<A, E> {
    return new FluentEvent(merge(this.event, ...others));
  }

  combine<B, C>(f: (a: A, b: B) => C, other: Event<B, E>): FluentEvent<C, E> {
    return new FluentEvent(combine(f, this.event, other));
  }

  zip<B>(other: Event<B, E>): FluentEvent<[A, B], E> {
    return new FluentEvent(zip(this.event, other));
  }

  // --- Higher-order ---

  chain<B>(f: (a: A) => Event<B, E>): FluentEvent<B, E> {
    return new FluentEvent(chain(f, this.event));
  }

  mergeMap<B>(f: (a: A) => Event<B, E>, concurrency: number): FluentEvent<B, E> {
    return new FluentEvent(mergeMapDirect(f, concurrency, this.event));
  }

  traverse<B>(f: (a: A) => Promise<B>, concurrency: number): FluentEvent<B, E> {
    return new FluentEvent(traverse(f, concurrency, this.event));
  }

  exhaustMap<B>(f: (a: A) => Event<B, E>): FluentEvent<B, E> {
    return new FluentEvent(exhaustMap(f, this.event));
  }

  // --- Error handling ---

  catchError<E2>(handler: (err: E) => Event<A, E2>): FluentEvent<A, E2> {
    return new FluentEvent(catchError(handler, this.event));
  }

  mapError<E2>(f: (err: E) => E2): FluentEvent<A, E2> {
    return new FluentEvent(mapError(f, this.event));
  }

  // --- Time ---

  debounce(duration: Duration): FluentEvent<A, E> {
    return new FluentEvent(debounce(duration, this.event));
  }

  throttle(duration: Duration): FluentEvent<A, E> {
    return new FluentEvent(throttle(duration, this.event));
  }

  delay(duration: Duration): FluentEvent<A, E> {
    return new FluentEvent(delay(duration, this.event));
  }

  bufferCount(count: number): FluentEvent<A[], E> {
    return new FluentEvent(bufferCount(count, this.event));
  }

  bufferTime(duration: Duration): FluentEvent<A[], E> {
    return new FluentEvent(bufferTime(duration, this.event));
  }

  // --- Behavior bridge ---

  sample<B>(behavior: Behavior<B, E>): FluentEvent<B, E> {
    return new FluentEvent(sample(behavior, this.event));
  }

  snapshot<B, C>(f: (b: B, a: A) => C, behavior: Behavior<B, E>): FluentEvent<C, E> {
    return new FluentEvent(snapshot(f, behavior, this.event));
  }

  retry(maxRetries: number, delayDuration?: Duration): FluentEvent<A, E> {
    return new FluentEvent(retry(maxRetries, this.event, delayDuration));
  }

  attach<B, C>(f: (a: A, b: B) => C, sampler: Event<B, E>): FluentEvent<C, E> {
    return new FluentEvent(attach(f, this.event, sampler));
  }

  timeout(duration: Duration) {
    return new FluentEvent(timeout(duration, this.event));
  }

  orElse(value: A): FluentEvent<A, E> {
    return new FluentEvent(orElse(value, this.event));
  }

  ensure(cleanup: () => void): FluentEvent<A, E> {
    return new FluentEvent(ensure(cleanup, this.event));
  }

  count(): FluentEvent<number, E> {
    return new FluentEvent(count(this.event));
  }

  all(predicate: (a: A) => boolean): FluentEvent<boolean, E> {
    return new FluentEvent(all(predicate, this.event));
  }

  elementAt(n: number): FluentEvent<A, E> {
    return new FluentEvent(elementAt(n, this.event));
  }

  race(...others: Event<A, E>[]): FluentEvent<A, E> {
    return new FluentEvent(race(this.event, ...others));
  }

  // --- Utilities ---

  multicast(): FluentEvent<A, E> {
    return new FluentEvent(multicast(this.event));
  }

  share(bufferSize: number): FluentEvent<A, E> {
    return new FluentEvent(share(bufferSize, this.event));
  }

  toAsyncIterator(scheduler: Scheduler): AsyncIterableIterator<A> & { dispose(): void } {
    return toAsyncIterator(this.event, scheduler);
  }

  // --- Terminal (activate the stream) ---

  reduce<B>(f: (acc: B, a: A) => B, seed: B, scheduler: Scheduler): Promise<B> {
    return reduce(f, seed, this.event, scheduler);
  }

  observe(f: (a: A) => void, scheduler: Scheduler): Promise<void> {
    return observe(f, this.event, scheduler);
  }

  drain(scheduler: Scheduler): Promise<void> {
    return drain(this.event, scheduler);
  }
}

/**
 * Wrap a pulse Event in a chainable fluent interface.
 *
 * ```typescript
 * const result = await fluent(fromArray([1, 2, 3, 4, 5]))
 *   .filter(x => x % 2 === 0)
 *   .map(x => x * 10)
 *   .take(2)
 *   .reduce((acc, x) => acc + x, 0, scheduler);
 * // result === 60
 * ```
 */
export const fluent = <A, E>(event: Event<A, E>): FluentEvent<A, E> => new FluentEvent(event);
