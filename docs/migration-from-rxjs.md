# Migrating from RxJS to Aeon

This guide maps RxJS concepts to their Aeon equivalents. Aeon is architecturally different from RxJS — it uses denotational semantics, separates discrete Events from continuous Behaviors, and provides three API styles instead of one.

## Core Concepts

| RxJS | Aeon | Notes |
|---|---|---|
| `Observable<T>` | `Event<A, E>` | Typed error channel `E` instead of untyped `error(err)` |
| — | `Behavior<A, E>` | Continuous time-varying value (no RxJS equivalent) |
| `Subject` | `createAdapter()` | Returns `[send, event]` tuple |
| `BehaviorSubject` | `stepper(initial, event)` | Creates a Behavior from an Event |
| `Subscription` | `Disposable` | Single `.dispose()` method |
| `Scheduler` | `Scheduler` | Aeon schedulers are required for terminal operators |
| `pipe(obs, op1, op2)` | `pipe(event, P.op1, P.op2)` | Pipeable operators live in `P` namespace |
| `obs.pipe(op1, op2)` | `fluent(event).op1().op2()` | Fluent API via `fluent()` wrapper |
| Direct: N/A | `op(arg, event)` | Data-first style — Aeon's primary API |

## API Style

RxJS has one style: `obs.pipe(map(...), filter(...))`. Aeon has three:

```typescript
// 1. Data-first (primary)
const result = take(10, filter(x => x > 0, map(x => x * 2, source)));

// 2. Pipeable (data-last, like RxJS pipe)
import { P } from "aeon-core";
const result = pipe(source, P.map(x => x * 2), P.filter(x => x > 0), P.take(10));

// 3. Fluent (chainable)
const result = fluent(source).map(x => x * 2).filter(x => x > 0).take(10);
```

## Operator Mapping

### Creation

| RxJS | Aeon |
|---|---|
| `of(1, 2, 3)` | `fromArray([1, 2, 3])` |
| `from([1, 2, 3])` | `fromArray([1, 2, 3])` |
| `from(iterable)` | `fromIterable(iterable)` |
| `from(promise)` | `fromPromise(promise)` |
| `from(asyncIterable)` | `fromAsyncIterable(asyncIterable)` |
| `EMPTY` | `empty()` |
| `NEVER` | `never()` |
| `interval(ms)` | `periodic(toDuration(ms))` |
| `timer(ms)` | `at(toTime(ms), undefined)` |
| `range(start, count)` | `range(start, count)` |
| `new Subject()` | `createAdapter()` — returns `[send, event]` |

### Transform

| RxJS | Aeon | Notes |
|---|---|---|
| `map(f)` | `map(f, e)` | |
| `filter(p)` | `filter(p, e)` | |
| `tap(f)` | `tap(f, e)` | |
| `mapTo(v)` | `constant(v, e)` | |
| `scan(f, seed)` | `scan(f, seed, e)` | |
| `distinctUntilChanged(eq?)` | `dedupe(e, eq?)` | |
| `startWith(v)` | `cons(v, e)` | |
| `pairwise()` | `pairwise(e)` | |
| `defaultIfEmpty(v)` | `orElse(v, e)` | |

### Slicing

| RxJS | Aeon | Notes |
|---|---|---|
| `take(n)` | `take(n, e)` | |
| `skip(n)` | `drop(n, e)` | |
| `takeWhile(p)` | `takeWhile(p, e)` | |
| `skipWhile(p)` | `dropWhile(p, e)` | |
| `first(p?)` | `first(e, p?)` | |
| `last(p?)` | `last(e, p?)` | |
| `elementAt(n)` | `elementAt(n, e)` | |
| `takeUntil(signal)` | `until(signal, e)` | |
| `skipUntil(signal)` | `since(signal, e)` | |

### Combining

| RxJS | Aeon | Notes |
|---|---|---|
| `merge(a, b, c)` | `merge(a, b, c)` | |
| `combineLatest([a, b], f)` | `combine(f, a, b)` | Binary only; nest for more |
| `zip(a, b)` | `zip(a, b)` | |
| `race(a, b)` | `race(a, b)` | |
| `forkJoin(a, b)` | `forkJoin(a, b)` | |
| `withLatestFrom(other, f)` | `attach(f, sampled, sampler)` | Argument order differs |

### Higher-order

| RxJS | Aeon | Notes |
|---|---|---|
| `concatMap(f)` | `chain(f, e)` | Sequential flatMap |
| `mergeMap(f)` | `mergeMap(f, Infinity, e)` | Pass concurrency as 2nd arg |
| `mergeMap(f, n)` | `mergeMap(f, n, e)` | Bounded concurrency |
| `switchMap(f)` | `switchLatest(map(f, e))` | Compose `map` + `switchLatest` |
| `exhaustMap(f)` | `exhaustMap(f, e)` | |

### Error handling

| RxJS | Aeon | Notes |
|---|---|---|
| `catchError(handler)` | `catchError(handler, e)` | Handler returns a new Event |
| `throwError(err)` | `throwError(err)` | |
| `retry(n)` | `retry(n, e, delay?)` | Optional delay between retries |
| `timeout(ms)` | `timeout(toDuration(ms), e)` | Throws `TimeoutError` |
| `finalize(cleanup)` | `ensure(cleanup, e)` | Runs on end, error, or dispose |

### Time

| RxJS | Aeon | Notes |
|---|---|---|
| `debounceTime(ms)` | `debounce(toDuration(ms), e)` | |
| `throttleTime(ms)` | `throttle(toDuration(ms), e)` | |
| `delay(ms)` | `delay(toDuration(ms), e)` | |
| `bufferCount(n)` | `bufferCount(n, e)` | |
| `bufferTime(ms)` | `bufferTime(toDuration(ms), e)` | |

### Terminal

| RxJS | Aeon | Notes |
|---|---|---|
| `subscribe(observer)` | `observe(f, e, scheduler)` | Returns `Promise<void>` |
| `subscribe()` | `drain(e, scheduler)` | Consume without side-effects |
| `reduce(f, seed)` then subscribe | `reduce(f, seed, e, scheduler)` | Returns `Promise<B>` |
| `toPromise()` / `firstValueFrom()` | `reduce(...)` or `first(e)` + `observe(...)` | |
| `every(p)` | `all(p, e)` | Emits boolean on end/fail |
| `count()` | `count(e)` | Emits count on end |

### Multicasting

| RxJS | Aeon |
|---|---|
| `share()` | `multicast(e)` |
| `shareReplay(n)` | `share(n, e)` |

## Key Differences

### Typed error channel

RxJS errors are untyped (`any`). Aeon tracks the error type as a type parameter:

```typescript
// Event<number, NetworkError> — the error type is explicit
const result: Event<number, NetworkError> = catchError(
  (err: NetworkError) => fromArray([0]),  // fallback
  riskyEvent,
);
```

### Behaviors

Aeon has a first-class `Behavior<A, E>` for continuous values. Where RxJS uses `BehaviorSubject` or `combineLatest` to model "current value," Aeon models this directly:

```typescript
import { constantB, mapB, stepper, sample } from "aeon-core";

const mouseX: Behavior<number, never> = stepper(0, mouseMoveEvents);
const doubled: Behavior<number, never> = mapB(x => x * 2, mouseX);

// Sample the behavior on each click
const clickPositions: Event<number, never> = sample(doubled, clicks);
```

### No implicit scheduling

RxJS subscribes immediately. Aeon terminal operators require an explicit `Scheduler`:

```typescript
import { DefaultScheduler } from "aeon-scheduler";

const scheduler = new DefaultScheduler();
await observe(console.log, myEvent, scheduler);
```

### Durations instead of milliseconds

RxJS uses raw numbers for time. Aeon uses branded `Duration` and `Time` types:

```typescript
import { toDuration } from "aeon-types";

debounce(toDuration(300), event);  // not debounce(300, event)
```

### Pipeline fusion

Aeon optimizes at construction time:

- `map(f, map(g, e))` fuses into a single `map(x => f(g(x)), e)`
- `filter(p, filter(q, e))` fuses into `filter(x => q(x) && p(x), e)`
- `take(n, take(m, e))` becomes `take(min(n, m), e)`
- `drop(n, drop(m, e))` becomes `drop(n + m, e)`

No runtime overhead from chaining — the optimizer eliminates intermediate allocations.
