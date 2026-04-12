# aeon-dom

DOM event sources and continuous-time browser Behaviors for [Aeon](https://github.com/joshburgess/aeon).

This package provides:

- **`fromDOMEvent(type, target, options?)`** — convert any DOM `EventTarget` event into an `Event<E, never>`
- **`animationFrames(scheduler)`** — `Event<DOMHighResTimeStamp, never>` driven by `requestAnimationFrame`
- **`mousePosition(scheduler)`** — `Behavior<{x, y}, never>` tracking the cursor
- **`windowSize(scheduler)`** — `Behavior<{width, height}, never>` tracking viewport size

## Installation

```bash
pnpm add aeon-core aeon-scheduler aeon-dom
```

## Quick Start

```typescript
import { observe } from "aeon-core";
import { DefaultScheduler } from "aeon-scheduler";
import { fromDOMEvent } from "aeon-dom";

const scheduler = new DefaultScheduler();

const clicks = fromDOMEvent("click", document.body);
observe((e) => console.log("clicked at", e.clientX, e.clientY), clicks, scheduler);
```

### Continuous Behaviors

```typescript
import { mousePosition, windowSize } from "aeon-dom";
import { liftA2B, readBehavior } from "aeon-core";
import { toTime } from "aeon-types";

const mouse = mousePosition(scheduler);
const size = windowSize(scheduler);

const relativeX = liftA2B((m, s) => m.x / s.width, mouse, size);
console.log(readBehavior(relativeX, toTime(performance.now())));
```

## Documentation

- [Main README](https://github.com/joshburgess/aeon#readme)
- [Getting Started](https://github.com/joshburgess/aeon/blob/main/docs/getting-started.md)

## License

MIT
