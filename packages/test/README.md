# aeon-test

Marble testing utilities and helpers for [Aeon](https://github.com/joshburgess/aeon).

This package provides:

- **`marble`** — RxJS-style marble syntax for declaratively constructing test events
- **`collect`** — synchronously collect all emitted values from an event into an array
- **`testEvent`** — helpers for building events that fire at specific virtual times
- **`assert`** — assertion helpers for comparing event sequences

For the underlying virtual scheduler, see [`aeon-scheduler`](https://www.npmjs.com/package/aeon-scheduler) (`VirtualScheduler`).

## Installation

```bash
pnpm add -D aeon-test aeon-scheduler
```

## Quick Start

```typescript
import { describe, it, expect } from "vitest";
import { map } from "aeon-core";
import { VirtualScheduler } from "aeon-scheduler";
import { collect } from "aeon-test";

describe("map", () => {
  it("doubles each value", () => {
    const scheduler = new VirtualScheduler();
    const result = collect(
      map((x: number) => x * 2, fromArray([1, 2, 3])),
      scheduler,
    );
    expect(result).toEqual([2, 4, 6]);
  });
});
```

## Documentation

- [Main README](https://github.com/joshburgess/aeon#readme)
- [Getting Started](https://github.com/joshburgess/aeon/blob/main/docs/getting-started.md)

## License

MIT
