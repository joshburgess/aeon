# aeon-core

The main package of [Aeon](https://github.com/joshburgess/aeon), a denotationally-designed reactive programming library for TypeScript.

Aeon provides two core abstractions with precise mathematical semantics:

- **`Event<A, E>`** — a discrete stream of time-stamped values with a typed error channel
- **`Behavior<A, E>`** — a continuous function from time to a value, evaluated lazily when sampled

## Features

- **Denotational semantics** — every combinator has a formal mathematical meaning
- **Typed error channel** — `E = never` means a stream provably cannot fail
- **V8-optimized** — monomorphic sink classes, hidden class discipline, construction-time pipeline fusion
- **Three API styles** — data-first composition, `pipe()` with data-last curried operators (`P.*`), fluent chainable methods
- **Behaviors** — continuous-time values with generation-based dirty-flag caching, plus numerical integration and differentiation
- **Comprehensive** — 50+ operators covering transforms, slicing, combining, higher-order, error handling, time, and aggregation
- **Small** — 1.5 KB gzipped minimal import, 8.3 KB full library

## Installation

```bash
pnpm add aeon-core aeon-scheduler
```

## Quick Start

```typescript
import { fromArray, map, filter, observe } from "aeon-core";
import { DefaultScheduler } from "aeon-scheduler";

const scheduler = new DefaultScheduler();

await observe(
  (v) => console.log(v),
  map(
    (x) => x * 2,
    filter((x) => x % 2 === 0, fromArray([1, 2, 3, 4, 5])),
  ),
  scheduler,
);
// 4, 8
```

### Using `pipe`

```typescript
import { fromArray, pipe, observe, P } from "aeon-core";
import { DefaultScheduler } from "aeon-scheduler";

const result = pipe(
  fromArray([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
  P.filter((x) => x % 2 === 0),
  P.map((x) => x * 2),
  P.take(3),
);

await observe((v) => console.log(v), result, new DefaultScheduler());
// 4, 8, 12
```

### Using the fluent API

```typescript
import { fromArray, fluent } from "aeon-core";
import { DefaultScheduler } from "aeon-scheduler";

await fluent(fromArray([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))
  .filter((x) => x % 2 === 0)
  .map((x) => x * 2)
  .take(3)
  .observe((v) => console.log(v), new DefaultScheduler());
// 4, 8, 12
```

## Documentation

- [Main README](https://github.com/joshburgess/aeon#readme)
- [Getting Started](https://github.com/joshburgess/aeon/blob/main/docs/getting-started.md)
- [Denotational Semantics](https://github.com/joshburgess/aeon/blob/main/docs/semantics.md)
- [Optimizations](https://github.com/joshburgess/aeon/blob/main/OPTIMIZATIONS.md)
- [Migration from RxJS](https://github.com/joshburgess/aeon/blob/main/docs/migration-from-rxjs.md)
- [Migration from @most/core](https://github.com/joshburgess/aeon/blob/main/docs/migration-from-most.md)

## License

MIT
