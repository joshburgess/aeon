# API Surface Expansion

Operators worth adding beyond what @most/core provides, without RxJS bloat.

## Tier 1 — High frequency, genuinely missing

- **`distinctUntilChanged(eq?)`** — Deduplication. Suppress consecutive
  duplicate values. Optional equality function (defaults to `===`).
- **`startWith(value)`** — Prepend an initial value before the first event.
  `concat(now(v), stream)` works but is clunky as a pattern.
- **`first()`** — Emit first value then end. Equivalent to `take(1)` but
  clearer intent. Optional predicate overload: `first(pred)`.
- **`last()`** — Emit only the final value on end. Requires internal buffer
  of one. Optional predicate overload.
- **`pairwise()`** — Emit `[prev, curr]` tuples. Essential for delta/diff
  tracking, animation frames, rate-of-change calculations.
- **`concatMap` alias** — Alias for `chain`. Naming alignment with RxJS
  conventions that most developers already know.

## Tier 2 — Real gaps, harder to compose from primitives

- **`timeout(duration)`** — Error if no emission within a time window.
  Common in real apps (network timeouts, heartbeat monitoring), hard to
  build correctly from primitives.
- **`exhaustMap(f)`** — Ignore new outer emissions while an inner stream is
  active. The missing counterpart to `switchLatest` (cancels inner) and
  `mergeMap` (runs all concurrently).
- **`forkJoin(...streams)`** — Wait for all streams to complete, emit
  array of their final values. Useful for parallel async work.
- **`defaultIfEmpty(value)`** — Emit a fallback if the stream completes
  without producing any values.
- **`finalize(cleanup)`** — Run a side-effect function on end or error.
  Currently requires manual error handling patterns.

## Tier 3 — Easy wins, convenience

- **`race(...streams)`** — First stream to emit wins, others are disposed.
- **`count()`** — Emit the total number of values on end.
- **`every(pred)`** — Emit `true` on end if all values matched predicate,
  `false` as soon as one fails.
- **`elementAt(n)`** — Emit only the nth value. `skip(n) | take(1)` but
  named for clarity.
- **`range(start, count)`** — Constructor for numeric sequences. Currently
  only exists as a benchmark helper.

## Intentionally skipped

- `window*` variants — `bufferCount`/`bufferTime` cover real use cases.
- `groupBy` — Complex semantics, rarely needed, hard to get right.
- `publish*`/`refCount` — `multicast` and `share` already handle this.
- `audit`/`auditTime` — Too similar to throttle/debounce to justify.
