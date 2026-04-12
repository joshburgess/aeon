# Aeon

A denotationally-designed reactive programming library for TypeScript.

Aeon provides two core abstractions with precise mathematical semantics:

- **Event\<A, E\>** — a discrete stream of time-stamped values with a typed error channel
- **Behavior\<A, E\>** — a continuous function from time to a value, evaluated lazily when sampled

## Features

- **Denotational semantics** — every combinator has a formal mathematical meaning
- **Typed error channel** — `E = never` means a stream provably cannot fail
- **V8-optimized** — monomorphic sink classes, hidden class discipline, construction-time pipeline fusion
- **Three API styles** — data-first composition, `pipe()` with data-last curried operators, fluent chainable methods
- **Behaviors** — continuous-time values with generation-based dirty-flag caching, numerical integration and differentiation
- **Comprehensive** — 50+ operators covering transforms, slicing, combining, higher-order, error handling, time, and aggregation
- **Small** — 2.8 KB gzipped minimal import, 8.3 KB typical app, 14 KB full library

## Installation

```bash
pnpm add aeon-core aeon-scheduler
```

Optional packages:

```bash
pnpm add aeon-dom       # DOM event sources, animation frames, mouse/window behaviors
pnpm add aeon-test      # Marble testing DSL, virtual scheduler
pnpm add aeon-devtools  # Stream labeling, tracing, graph inspection
```

## Quick Start

```typescript
import { fromArray, map, filter, observe } from "aeon-core";
import { VirtualScheduler } from "aeon-scheduler";

const scheduler = new VirtualScheduler();

await observe(
  (v) => console.log(v),
  map(
    (x) => x * 2,
    filter((x) => x % 2 === 0, fromArray([1, 2, 3, 4, 5])),
  ),
  scheduler,
);
// 4, 8, 12, 16, 20
```

### Using `pipe`

```typescript
import { fromArray, pipe, observe, P } from "aeon-core";

const result = pipe(
  fromArray([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
  P.filter((x) => x % 2 === 0),
  P.map((x) => x * 2),
  P.take(3),
);

await observe((v) => console.log(v), result, scheduler);
// 4, 8, 12
```

### Using the fluent API

```typescript
import { fromArray, fluent } from "aeon-core";

await fluent(fromArray([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))
  .filter((x) => x % 2 === 0)
  .map((x) => x * 2)
  .take(3)
  .observe((v) => console.log(v), scheduler);
// 4, 8, 12
```

## Behaviors

Behaviors model continuous values — functions from time that are evaluated lazily when sampled.

```typescript
import { constantB, time, mapB, liftA2B, stepper, sample, readBehavior } from "aeon-core";
import { toTime } from "aeon-types";

// A constant behavior — always 10
const ten = constantB(10);
readBehavior(ten, toTime(0));   // 10
readBehavior(ten, toTime(500)); // 10

// The identity behavior — returns current time
readBehavior(time, toTime(42)); // 42

// Combine behaviors
const sum = liftA2B((a, b) => a + b, ten, time);
readBehavior(sum, toTime(3)); // 13

// Bridge: stepper holds the latest event value as a Behavior
const latest = stepper(0, someEventStream);

// Bridge: sample reads a Behavior whenever an Event fires
const sampled = sample(latest, ticker);
```

## Performance

3-way benchmarks against @most/core and RxJS (higher is better):

| Benchmark | Aeon | @most/core | RxJS |
|---|---|---|---|
| push filter-map-scan (100k) | **2,541 ops/s** | 568 | 273 |
| mergeMap 1k x 100 | **5,613 ops/s** | 1,862 | 1,039 |
| take(100) from push 10k | **99,102 ops/s** | 39,798 | 7,840 |
| flatMap 1000 x 1000 | **2,320 ops/s** | 2,116 | 110 |
| switchLatest 1000 x 100 | **3,439 ops/s** | DNF | 668 |
| dedupe 100k | 3,888 ops/s | **6,708** | 1,885 |
| cons 100k | **13,838 ops/s** | 5,079 | 1,123 |
| exhaustMap 1000 x 1000 | **166 ops/s** | -- | 152 |

### Pipeline fusion

Adjacent operators are automatically fused at construction time:

- `map(f, map(g, s))` fuses to `map(f . g, s)`
- `filter(p, filter(q, s))` fuses to `filter(x => q(x) && p(x), s)`
- `map(f, filter(p, s))` fuses to `filterMap(p, f, s)`
- `take(n, take(m, s))` fuses to `take(min(n, m), s)`
- Plus 4 more fusion rules and 7 algebraic simplifications

### Sync loop compilation

Synchronous sources bypass the Sink protocol entirely via `syncIterate`, enabling `take(100)` from 1M elements to complete in ~3us (vs ~6.8ms for @most/core).

## Bundle Size

| Import | Raw | Gzipped |
|---|---:|---:|
| Minimal (`fromArray`, `map`, `filter`, `reduce`) | 12.3 KB | **2.8 KB** |
| Typical app (30+ operators + scheduler) | 50.4 KB | **8.3 KB** |
| Full library (core + scheduler) | 88.1 KB | **14.0 KB** |

All packages declare `sideEffects: false` for proper tree-shaking.

## Packages

| Package | Description | Gzipped |
|---|---|---:|
| `aeon-core` | Event and Behavior implementations, all combinators | 20.2 KB |
| `aeon-scheduler` | Default and virtual time schedulers | 2.1 KB |
| `aeon-types` | Branded types, HKT encoding, interfaces | 0.9 KB |
| `aeon-dom` | DOM event sources, animation frame behaviors | 1.1 KB |
| `aeon-devtools` | Stream labeling, tracing, graph inspection | 2.2 KB |
| `aeon-test` | Marble testing DSL, virtual scheduler helpers | 2.3 KB |

## Documentation

- [Getting Started](./docs/getting-started.md) — installation, tutorial, full API reference
- [Denotational Semantics](./docs/semantics.md) — formal meaning of every type and combinator
- [Optimizations](./OPTIMIZATIONS.md) — performance architecture and benchmark analysis
- [Migration from RxJS](./docs/migration-from-rxjs.md) — side-by-side operator comparison
- [Migration from @most/core](./docs/migration-from-most.md) — side-by-side operator comparison

## License

MIT
