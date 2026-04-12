# Getting Started with Aeon

Aeon is a reactive programming library for TypeScript built on denotational semantics. It provides two core abstractions:

- **Event** — a discrete stream of time-stamped values (push-based)
- **Behavior** — a continuous function from time to a value (pull-based)

## Installation

```bash
pnpm add aeon-core aeon-scheduler
```

Optional packages:

```bash
pnpm add aeon-dom       # DOM event sources, animation frames, mouse/window behaviors
pnpm add aeon-test      # Marble testing DSL, virtual scheduler, assertion helpers
pnpm add aeon-devtools  # Stream labeling, tracing, graph inspection
```

## Your First Stream

Create an Event from an array, transform it, and observe the results:

```typescript
import { fromArray, map, filter, observe } from "aeon-core";
import { DefaultScheduler } from "aeon-scheduler";

const scheduler = new DefaultScheduler();

const numbers = fromArray([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

const evenDoubled = map(
  (x: number) => x * 2,
  filter((x: number) => x % 2 === 0, numbers),
);

await observe((value) => console.log(value), evenDoubled).run(scheduler);
// 4, 8, 12, 16, 20
```

### Using `pipe` for Readability

The `pipe` function lets you write pipelines top-to-bottom:

```typescript
import { fromArray, pipe, observe } from "aeon-core";
import { P } from "aeon-core"; // pipeable (data-last) overloads
import { DefaultScheduler } from "aeon-scheduler";

const scheduler = new DefaultScheduler();

const result = pipe(
  fromArray([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
  P.filter((x: number) => x % 2 === 0),
  P.map((x: number) => x * 2),
  P.take(3),
);

await observe((value) => console.log(value), result).run(scheduler);
// 4, 8, 12
```

### Using the Fluent API

For a chainable style:

```typescript
import { fromArray, fluent } from "aeon-core";
import { DefaultScheduler } from "aeon-scheduler";

const scheduler = new DefaultScheduler();

await fluent(fromArray([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))
  .filter((x) => x % 2 === 0)
  .map((x) => x * 2)
  .take(3)
  .observe((value) => console.log(value))
  .run(scheduler);
// 4, 8, 12
```

## Behaviors: Continuous Values

A Behavior has a value at every point in time. Unlike Events, Behaviors are evaluated lazily when sampled.

```typescript
import { constantB, time, mapB, liftA2B, readBehavior } from "aeon-core";
import { toTime } from "aeon-types";

// A constant behavior — always returns 10
const ten = constantB(10);
console.log(readBehavior(ten, toTime(0)));   // 10
console.log(readBehavior(ten, toTime(500))); // 10

// The identity behavior — returns the current time
console.log(readBehavior(time, toTime(42))); // 42

// Transform a behavior
const doubled = mapB((t: number) => t * 2, time);
console.log(readBehavior(doubled, toTime(5))); // 10

// Combine two behaviors
const sum = liftA2B((a: number, b: number) => a + b, ten, time);
console.log(readBehavior(sum, toTime(3))); // 13
```

## Bridging Events and Behaviors

`stepper` creates a Behavior from an Event — it holds the latest emitted value:

```typescript
import { fromArray, stepper, sample, observe } from "aeon-core";
import { periodic } from "aeon-core";
import { DefaultScheduler } from "aeon-scheduler";

const scheduler = new DefaultScheduler();

// stepper holds the latest value from the event, starting with 0
const latest = stepper(0, fromArray([1, 2, 3]));

// sample reads the behavior whenever a sampler event fires
const sampled = sample(latest, periodic(100));
```

`snapshot` combines a Behavior's current value with each Event emission:

```typescript
import { fromArray, snapshot, time, observe } from "aeon-core";
import { DefaultScheduler } from "aeon-scheduler";

const scheduler = new DefaultScheduler();

// Pair each event value with the current time
const withTime = snapshot(
  (t: number, v: number) => ({ time: t, value: v }),
  time,
  fromArray([10, 20, 30]),
);
```

## Error Handling

Events carry a typed error channel `E`. Use `catchError` and `mapError` to handle failures:

```typescript
import { throwError, catchError, now, observe } from "aeon-core";
import { DefaultScheduler } from "aeon-scheduler";

const scheduler = new DefaultScheduler();

const failing = throwError(new Error("boom"));
const recovered = catchError(() => now(42), failing);

await observe((v) => console.log(v), recovered).run(scheduler);
// 42
```

When `E = never`, the stream provably cannot fail — no error handling needed.

## Accumulating State with `scan`

```typescript
import { fromArray, scan, observe } from "aeon-core";
import { DefaultScheduler } from "aeon-scheduler";

const scheduler = new DefaultScheduler();

const sum = scan((acc: number, x: number) => acc + x, 0, fromArray([1, 2, 3, 4, 5]));

await observe((v) => console.log(v), sum).run(scheduler);
// 1, 3, 6, 10, 15
```

## Time Operators

```typescript
import { debounce, throttle, delay } from "aeon-core";
import { toDuration } from "aeon-types";

// debounce — emit latest after 200ms of silence
const debounced = debounce(toDuration(200), source);

// throttle — emit at most once per 100ms
const throttled = throttle(toDuration(100), source);

// delay — shift all emissions forward by 50ms
const delayed = delay(toDuration(50), source);
```

## DOM Events

The `aeon-dom` package provides Event sources from the DOM:

```typescript
import { fromDOMEvent, animationFrames, mousePosition, windowSize } from "aeon-dom";
import { map, observe } from "aeon-core";
import { DefaultScheduler } from "aeon-scheduler";

const scheduler = new DefaultScheduler();

// DOM events as a stream
const clicks = fromDOMEvent("click", document.body);

await observe((e) => {
  console.log("Clicked at", e.clientX, e.clientY);
}, clicks).run(scheduler);

// Continuous behaviors from the DOM
const mouse = mousePosition(scheduler);    // Behavior<Point>
const size = windowSize(scheduler);        // Behavior<Size>
```

## Testing with Marble Diagrams

The `aeon-test` package provides a marble DSL for declarative stream testing:

```typescript
import { testEvent, collectEvents, assertEvents } from "aeon-test";
import { VirtualScheduler } from "aeon-scheduler";
import { map, filter } from "aeon-core";

const scheduler = new VirtualScheduler();

// "--a--b--c--|" means:
//   -- = 2 time units of silence
//   a  = emit value mapped from { a: 1 }
//   -- = 2 more time units
//   b  = emit 2
//   etc.
//   |  = end

const source = testEvent("--a--b--c--|", { a: 1, b: 2, c: 3 });

const result = map(
  (x: number) => x * 10,
  filter((x: number) => x > 1, source),
);

const collected = collectEvents(result, scheduler);
scheduler.runAll();

assertEvents(collected.events, [
  { time: 5, value: 20 },
  { time: 8, value: 30 },
]);
```

## Devtools

Label, trace, and inspect your stream graphs:

```typescript
import { label, trace, inspect } from "aeon-devtools";
import { fromArray, map, filter, merge } from "aeon-core";

// Label streams for debugging
const clicks = label("user-clicks", fromDOMEvent("click", document));

// Trace logs every event, error, and end to the console
const traced = trace(clicks, { label: "clicks" });

// Inspect builds a serializable tree of the operator graph
const pipeline = map((x: number) => x * 2, filter((x: number) => x > 0, fromArray([1, 2, 3])));
const tree = inspect(pipeline);
// { type: "map", children: [{ type: "filter", children: [{ type: "fromArray", children: [] }] }] }
```

## Pipeline Fusion

Aeon automatically fuses adjacent operators at construction time. These are transparent optimizations — the fused pipelines are observationally equivalent to the unfused forms:

- `map(f, map(g, s))` fuses to `map(f . g, s)`
- `filter(p, filter(q, s))` fuses to `filter(x => q(x) && p(x), s)`
- `map(f, filter(p, s))` fuses to `filterMap(p, f, s)`
- `take(n, take(m, s))` fuses to `take(min(n, m), s)`
- `drop(n, drop(m, s))` fuses to `drop(n + m, s)`

No configuration needed — these happen automatically.

## API Reference

### Constructors

| Constructor | Description |
|---|---|
| `empty()` | Emits nothing, ends immediately |
| `never()` | Never emits, never ends |
| `now(x)` | One value at current time |
| `at(t, x)` | One value at time `t` |
| `fromArray(xs)` | All values synchronously |
| `fromIterable(iter)` | All values from any iterable |
| `periodic(d)` | Infinite ticks at interval `d` |
| `range(start, count)` | Sequence of `count` integers from `start` |
| `fromPromise(p)` | Single value from a Promise |
| `fromAsyncIterable(iter)` | Values from an async iterable |
| `createAdapter()` | Imperative push source |

### Transform

| Operator | Description |
|---|---|
| `map(f, e)` | Transform each value |
| `filter(p, e)` | Keep values matching predicate |
| `tap(f, e)` | Side-effect without altering values |
| `constant(v, e)` | Replace all values with `v` |
| `scan(f, seed, e)` | Running accumulation |
| `dedupe(e, eq?)` | Suppress consecutive duplicates |
| `cons(v, e)` | Prepend an initial value |
| `pairwise(e)` | Emit `[prev, curr]` tuples |
| `orElse(v, e)` | Fallback if stream completes empty |

### Slicing

| Operator | Description |
|---|---|
| `take(n, e)` | First `n` values |
| `drop(n, e)` | Drop first `n` values |
| `takeWhile(p, e)` | Take while predicate holds |
| `dropWhile(p, e)` | Drop while predicate holds |
| `slice(start, end, e)` | Values in index range |
| `first(e, pred?)` | First value (optionally matching predicate) |
| `last(e, pred?)` | Final value (optionally matching predicate) |
| `elementAt(n, e)` | Only the nth value |
| `until(signal, e)` | Take until signal fires |
| `since(signal, e)` | Skip until signal fires |

### Combining

| Operator | Description |
|---|---|
| `merge(...es)` | Interleave multiple streams |
| `combine(f, a, b)` | Combine latest from two streams |
| `zip(a, b)` | Pair values by index |
| `race(...es)` | First to emit wins, others disposed |
| `forkJoin(...es)` | Array of final values when all complete |
| `attach(f, sampled, sampler)` | Combine sampler events with latest from sampled |

### Higher-order

| Operator | Description |
|---|---|
| `chain(f, e)` | Map to inner stream, flatten sequentially |
| `mergeMap(f, n, e)` | Map to inner stream, flatten with concurrency limit |
| `exhaustMap(f, e)` | Map to inner stream, ignore while inner active |
| `switchLatest(ee)` | Flatten, cancelling previous inner on new outer |
| `traverse(f, n, e)` | Map to Promise, resolve with concurrency limit |

### Error handling

| Operator | Description |
|---|---|
| `catchError(handler, e)` | Recover from errors with a new stream |
| `mapError(f, e)` | Transform error type |
| `throwError(err)` | Emit an error immediately |
| `timeout(d, e)` | Error if no event within duration |
| `retry(n, e, delay?)` | Resubscribe on error up to `n` times |

### Time

| Operator | Description |
|---|---|
| `debounce(d, e)` | Emit latest after silence of duration `d` |
| `throttle(d, e)` | At most one emission per duration `d` |
| `delay(d, e)` | Shift all emissions forward by `d` |
| `bufferCount(n, e)` | Collect values into arrays of size `n` |
| `bufferTime(d, e)` | Collect values into arrays by time window |

### Aggregation

| Operator | Description |
|---|---|
| `count(e)` | Total number of values on end |
| `all(p, e)` | `true` if all match, `false` on first failure |

### Terminal (activate the stream)

| Operator | Description |
|---|---|
| `reduce(f, seed, e, scheduler)` | Fold to single value |
| `observe(f, e, scheduler)` | Run side-effect for each value |
| `drain(e, scheduler)` | Run stream, discard values |

### Utilities

| Operator | Description |
|---|---|
| `multicast(e)` | Share a single subscription |
| `share(bufferSize, e)` | Share with replay buffer |
| `ensure(cleanup, e)` | Run cleanup on end/error/dispose |
| `toAsyncIterator(e, scheduler)` | Convert to async iterator |

### Behavior constructors

| Constructor | Description |
|---|---|
| `constantB(v)` | Constant value at all times |
| `fromFunction(f)` | Behavior from `Time -> A` |
| `time` | Identity behavior (returns current time) |
| `pureB(v)` | Alias for `constantB` |
| `stepper(init, e)` | Hold latest event value |
| `accumB(f, init, e, scheduler)` | Fold events into a behavior |
| `switcher(init, ee)` | Switch to latest inner behavior |

### Behavior combinators

| Operator | Description |
|---|---|
| `mapB(f, b)` | Transform a behavior's value |
| `liftA2B(f, a, b)` | Combine 2 behaviors |
| `liftA3B(f, a, b, c)` | Combine 3 behaviors |
| `liftA4B(f, a, b, c, d)` | Combine 4 behaviors |
| `liftA5B(f, a, b, c, d, e)` | Combine 5 behaviors |
| `switchB(bb)` | Monadic join: flatten `Behavior<Behavior<A>>` |
| `integral(b, dt)` | Numerical integration |
| `derivative(b, dt)` | Numerical differentiation |

### Event-Behavior bridge

| Operator | Description |
|---|---|
| `sample(b, sampler)` | Read behavior on each sampler event |
| `snapshot(f, b, e)` | Combine behavior value with each event |

All operators are available in three styles:

- **Data-first**: `map(f, event)` — direct composition
- **Pipeable**: `pipe(event, P.map(f), P.filter(p))` — data-last curried via `P.*`
- **Fluent**: `fluent(event).map(f).filter(p)` — chainable methods

## What's Next

- Read the [Denotational Semantics](./semantics.md) for the formal meaning of every operator
- See the [Optimizations](../OPTIMIZATIONS.md) doc for performance architecture details
