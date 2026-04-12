# aeon-devtools

Debug instrumentation for [Aeon](https://github.com/joshburgess/aeon) reactive streams.

This package provides:

- **`label(name, event)`** — attach a debug name to a stream node for use in inspection and tracing
- **`trace(event, options?)`** — log every event, error, and end signal to the console (with optional formatter)
- **`inspect(event)`** — produce a serializable tree describing the stream's operator graph

These tools are designed to be opt-in: you only pay for them where you import them, and the rest of Aeon has zero awareness that they exist.

## Installation

```bash
pnpm add -D aeon-devtools
```

## Quick Start

```typescript
import { fromArray, map, filter, observe } from "aeon-core";
import { DefaultScheduler } from "aeon-scheduler";
import { label, trace, inspect } from "aeon-devtools";

const scheduler = new DefaultScheduler();

const evens = label("evens", filter((x: number) => x % 2 === 0, fromArray([1, 2, 3, 4, 5])));
const doubled = label("doubled", map((x) => x * 2, evens));
const traced = trace(doubled);

console.log(JSON.stringify(inspect(doubled), null, 2));
// { type: "MapSource", name: "doubled", upstream: { type: "FilterSource", name: "evens", ... } }

await observe((v) => v, traced, scheduler);
```

## Documentation

- [Main README](https://github.com/joshburgess/aeon#readme)
- [Getting Started](https://github.com/joshburgess/aeon/blob/main/docs/getting-started.md)

## License

MIT
