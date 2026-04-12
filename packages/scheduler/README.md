# aeon-scheduler

Scheduler implementations for [Aeon](https://github.com/joshburgess/aeon), a denotationally-designed reactive programming library for TypeScript.

This package provides:

- **`DefaultScheduler`** — production scheduler backed by `performance.now()` with a binary-heap timer queue and microtask batching for zero-delay tasks
- **`VirtualScheduler`** — fully deterministic synchronous scheduler for tests; supports `advance(duration)`, `advanceTo(time)`, `flush()`, `runAll()`
- **`PerformanceClock`**, **`DateClock`**, **`VirtualClock`** — pluggable clock implementations

## Installation

```bash
pnpm add aeon-core aeon-scheduler
```

## Quick Start

```typescript
import { fromArray, map, observe } from "aeon-core";
import { DefaultScheduler } from "aeon-scheduler";

const scheduler = new DefaultScheduler();

await observe(
  (v) => console.log(v),
  map((x) => x * 2, fromArray([1, 2, 3])),
  scheduler,
);
// 2, 4, 6
```

For tests, use the `VirtualScheduler` to control time deterministically:

```typescript
import { VirtualScheduler } from "aeon-scheduler";

const scheduler = new VirtualScheduler();
// schedule things, then advance virtual time:
scheduler.advance(toDuration(1000));
```

## Documentation

- [Main README](https://github.com/joshburgess/aeon#readme)
- [Getting Started](https://github.com/joshburgess/aeon/blob/main/docs/getting-started.md)

## License

MIT
