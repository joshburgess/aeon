# Migrating from @most/core to Aeon

Aeon shares lineage with most.js — both use push-based event streams with denotational semantics, monomorphic sink classes, and `Disposable`-based resource management. This guide covers the differences.

## Core Concepts

| @most/core | Aeon | Notes |
|---|---|---|
| `Stream<A>` | `Event<A, E>` | Typed error channel `E` |
| — | `Behavior<A, E>` | Continuous time-varying value (not in most.js) |
| `Sink<A>` | `Sink<A, E>` | Error type parameter added |
| `Disposable` | `Disposable` | Same interface |
| `Scheduler` | `Scheduler` | Same role, different implementation |
| `newDefaultScheduler()` | `new DefaultScheduler()` | |
| `currentTime(scheduler)` | `scheduler.currentTime()` | Method on instance, not standalone |

## API Style

most.js is data-last only (`pipe` or combinator composition). Aeon offers three styles:

```typescript
// 1. Data-first (primary — most.js doesn't have this)
const result = take(10, filter(x => x > 0, map(x => x * 2, source)));

// 2. Pipeable (data-last, closest to most.js pipe)
import { P } from "aeon-core";
const result = pipe(source, P.map(x => x * 2), P.filter(x => x > 0), P.take(10));

// 3. Fluent (chainable)
const result = fluent(source).map(x => x * 2).filter(x => x > 0).take(10);
```

## Operator Mapping

Most operators translate directly. The main differences are names, argument order (Aeon data-first puts the Event last in the standalone API, first in fluent), and the typed error channel.

### Creation

| @most/core | Aeon | Notes |
|---|---|---|
| `empty()` | `empty()` | |
| `never()` | `never()` | |
| `now(x)` | `now(x)` | |
| `at(t, x)` | `at(t, x)` | |
| `periodic(period)` | `periodic(duration)` | Aeon uses branded `Duration` |

Aeon adds constructors most.js lacks: `fromArray`, `fromIterable`, `range`, `fromPromise`, `fromAsyncIterable`, `createAdapter`.

### Transform

| @most/core | Aeon | Notes |
|---|---|---|
| `map(f, s)` | `map(f, e)` | Same |
| `tap(f, s)` | `tap(f, e)` | Same |
| `constant(v, s)` | `constant(v, e)` | Same |
| `scan(f, seed, s)` | `scan(f, seed, e)` | Same |
| `startWith(v, s)` | `cons(v, e)` | Renamed |
| `skipRepeats(s)` | `dedupe(e)` | Renamed; `dedupe(e, eq?)` takes optional equality |
| `skipRepeatsWith(eq, s)` | `dedupe(e, eq)` | Merged into one function |

### Slicing

| @most/core | Aeon | Notes |
|---|---|---|
| `take(n, s)` | `take(n, e)` | Same |
| `skip(n, s)` | `drop(n, e)` | Renamed |
| `takeWhile(p, s)` | `takeWhile(p, e)` | Same |
| `skipWhile(p, s)` | `dropWhile(p, e)` | Renamed |
| `slice(start, end, s)` | `slice(start, end, e)` | Same |
| `until(signal, s)` | `until(signal, e)` | Same |
| `since(signal, s)` | `since(signal, e)` | Same |

### Combining

| @most/core | Aeon | Notes |
|---|---|---|
| `merge(a, b)` | `merge(a, b, ...)` | Aeon is variadic |
| `combine(f, a, b)` | `combine(f, a, b)` | Same |
| `zip(f, a, b)` | `zip(a, b)` | Aeon zips into tuples; apply `f` separately with `map` |
| `sample(f, sampler, behavior)` | `snapshot(f, behavior, sampler)` | Different name and argument order |
| `snapshot(f, behavior, s)` | `snapshot(f, behavior, e)` | Same |

### Higher-order

| @most/core | Aeon | Notes |
|---|---|---|
| `chain(f, s)` | `chain(f, e)` | Same |
| `concatMap(f, s)` | `chain(f, e)` | Aeon uses `chain` only, no alias |
| `switchLatest(ss)` | `switchLatest(ee)` | Same |
| `mergeConcurrently(n, ss)` | `mergeMap(f, n, e)` | Aeon combines map+merge in one operator |
| `mergeMapConcurrently(f, n, s)` | `mergeMap(f, n, e)` | Renamed |

### Error handling

| @most/core | Aeon | Notes |
|---|---|---|
| `recoverWith(handler, s)` | `catchError(handler, e)` | Renamed |
| `throwError(err)` | `throwError(err)` | Same (Aeon version is typed) |

Aeon adds operators most.js lacks: `mapError`, `retry`, `timeout`, `ensure`.

### Time

| @most/core | Aeon | Notes |
|---|---|---|
| `delay(duration, s)` | `delay(duration, e)` | Same |
| `debounce(duration, s)` | `debounce(duration, e)` | Same |
| `throttle(duration, s)` | `throttle(duration, e)` | Same |

Aeon adds: `bufferCount`, `bufferTime`.

### Terminal

| @most/core | Aeon | Notes |
|---|---|---|
| `runEffects(s, scheduler)` | `drain(e, scheduler)` | Returns `Promise<void>` |
| `run(sink, scheduler, s)` | Low-level: `_getSource(e).run(sink, scheduler)` | Prefer `observe`/`drain`/`reduce` |

Aeon adds: `observe(f, e, scheduler)`, `reduce(f, seed, e, scheduler)`.

### Multicasting

| @most/core | Aeon |
|---|---|
| `multicast(s)` | `multicast(e)` |

Aeon adds `share(bufferSize, e)` for replay.

## Operators Aeon Adds

These have no @most/core equivalent:

| Operator | Description |
|---|---|
| `filter(p, e)` | most.js has `filter` too, but Aeon fuses `filter(p, filter(q, e))` |
| `first(e, p?)` | First value, optionally matching predicate |
| `last(e, p?)` | Final value, optionally matching predicate |
| `pairwise(e)` | Emit `[prev, curr]` tuples |
| `orElse(v, e)` | Fallback value if stream is empty |
| `exhaustMap(f, e)` | Ignore new inners while one is active |
| `race(a, b, ...)` | First to emit wins |
| `forkJoin(a, b, ...)` | Final values from all |
| `attach(f, sampled, sampler)` | Combine latest from sampled with each sampler event |
| `traverse(f, n, e)` | Async map with concurrency |
| `mapError(f, e)` | Transform error type |
| `retry(n, e, delay?)` | Resubscribe on error |
| `timeout(d, e)` | Error on silence |
| `ensure(cleanup, e)` | Guaranteed cleanup |
| `all(p, e)` | Boolean — all values match? |
| `count(e)` | Emit count on end |
| `elementAt(n, e)` | Only the nth value |
| `bufferCount(n, e)` | Batch by count |
| `bufferTime(d, e)` | Batch by time window |

## Key Differences

### Typed error channel

most.js errors are untyped. Aeon tracks errors as `Event<A, E>`:

```typescript
const safe: Event<number, never> = catchError(
  (err: NetworkError) => fromArray([0]),
  riskyEvent,  // Event<number, NetworkError>
);
```

### Behaviors

Aeon has first-class continuous Behaviors, inspired by Conal Elliott's original FRP:

```typescript
import { constantB, mapB, stepper, sample, integral } from "aeon-core";

const position = stepper(0, positionUpdates);
const velocity = mapB(x => x * 2, position);
const displacement = integral(dt, velocity);

// Sample on each tick
const sampled = sample(position, ticks);
```

### Pipeline fusion

Like most.js, Aeon optimizes pipelines. But Aeon goes further with algebraic simplifications at construction time:

- `map(f, map(g, e))` → `map(x => f(g(x)), e)`
- `filter(p, filter(q, e))` → `filter(x => q(x) && p(x), e)`
- `take(n, take(m, e))` → `take(min(n, m), e)`
- `drop(n, drop(m, e))` → `drop(n + m, e)`
- Operations on `empty()` short-circuit

### Sync fast path

Aeon detects synchronous sources (`fromArray`, `fromIterable`, `range`) and uses a `syncIterate` fast path that bypasses the full `Sink` protocol. This is why Aeon benchmarks faster than most.js on synchronous workloads.

### Three API styles

most.js only supports data-last composition. Aeon supports data-first, pipeable (data-last), and fluent, so you can choose the style that fits your context.
