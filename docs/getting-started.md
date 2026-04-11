# Getting Started with Pulse

Pulse is a reactive programming library for TypeScript built on denotational semantics. It provides two core abstractions:

- **Event** — a discrete stream of time-stamped values (push-based)
- **Behavior** — a continuous function from time to a value (pull-based)

## Installation

```bash
pnpm add @pulse/core @pulse/scheduler
```

Optional packages:

```bash
pnpm add @pulse/dom       # DOM event sources, animation frames, mouse/window behaviors
pnpm add @pulse/test      # Marble testing DSL, virtual scheduler, assertion helpers
pnpm add @pulse/devtools  # Stream labeling, tracing, graph inspection
```

## Your First Stream

Create an Event from an array, transform it, and observe the results:

```typescript
import { fromArray, map, filter, observe } from "@pulse/core";
import { DefaultScheduler } from "@pulse/scheduler";

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
import { fromArray, pipe, observe } from "@pulse/core";
import { P } from "@pulse/core"; // pipeable (data-last) overloads
import { DefaultScheduler } from "@pulse/scheduler";

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
import { fromArray, fluent } from "@pulse/core";
import { DefaultScheduler } from "@pulse/scheduler";

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
import { constantB, time, mapB, liftA2B, readBehavior } from "@pulse/core";
import { toTime } from "@pulse/types";

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
import { fromArray, stepper, sample, observe } from "@pulse/core";
import { periodic } from "@pulse/core";
import { DefaultScheduler } from "@pulse/scheduler";

const scheduler = new DefaultScheduler();

// stepper holds the latest value from the event, starting with 0
const latest = stepper(0, fromArray([1, 2, 3]));

// sample reads the behavior whenever a sampler event fires
const sampled = sample(latest, periodic(100));
```

`snapshot` combines a Behavior's current value with each Event emission:

```typescript
import { fromArray, snapshot, time, observe } from "@pulse/core";
import { DefaultScheduler } from "@pulse/scheduler";

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
import { throwError, catchError, now, observe } from "@pulse/core";
import { DefaultScheduler } from "@pulse/scheduler";

const scheduler = new DefaultScheduler();

const failing = throwError(new Error("boom"));
const recovered = catchError(() => now(42), failing);

await observe((v) => console.log(v), recovered).run(scheduler);
// 42
```

When `E = never`, the stream provably cannot fail — no error handling needed.

## Accumulating State with `scan`

```typescript
import { fromArray, scan, observe } from "@pulse/core";
import { DefaultScheduler } from "@pulse/scheduler";

const scheduler = new DefaultScheduler();

const sum = scan((acc: number, x: number) => acc + x, 0, fromArray([1, 2, 3, 4, 5]));

await observe((v) => console.log(v), sum).run(scheduler);
// 1, 3, 6, 10, 15
```

## Time Operators

```typescript
import { debounce, throttle, delay } from "@pulse/core";
import { toDuration } from "@pulse/types";

// debounce — emit latest after 200ms of silence
const debounced = debounce(toDuration(200), source);

// throttle — emit at most once per 100ms
const throttled = throttle(toDuration(100), source);

// delay — shift all emissions forward by 50ms
const delayed = delay(toDuration(50), source);
```

## DOM Events

The `@pulse/dom` package provides Event sources from the DOM:

```typescript
import { fromDOMEvent, animationFrames, mousePosition, windowSize } from "@pulse/dom";
import { map, observe } from "@pulse/core";
import { DefaultScheduler } from "@pulse/scheduler";

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

The `@pulse/test` package provides a marble DSL for declarative stream testing:

```typescript
import { testEvent, collectEvents, assertEvents } from "@pulse/test";
import { VirtualScheduler } from "@pulse/scheduler";
import { map, filter } from "@pulse/core";

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
import { label, trace, inspect } from "@pulse/devtools";
import { fromArray, map, filter, merge } from "@pulse/core";

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

Pulse automatically fuses adjacent operators at construction time. These are transparent optimizations — the fused pipelines are observationally equivalent to the unfused forms:

- `map(f, map(g, s))` fuses to `map(f . g, s)`
- `filter(p, filter(q, s))` fuses to `filter(x => q(x) && p(x), s)`
- `map(f, filter(p, s))` fuses to `filterMap(p, f, s)`
- `take(n, take(m, s))` fuses to `take(min(n, m), s)`
- `skip(n, skip(m, s))` fuses to `skip(n + m, s)`

No configuration needed — these happen automatically.

## What's Next

- Read the [Denotational Semantics](./semantics.md) for the formal meaning of every operator
- Explore `@pulse/core` source for advanced combinators: `switchLatest`, `mergeMapConcurrently`, `mapAsync`, `combine`, `zip`
- See the `integral` combinator for numerical integration of Behaviors
