# API Surface Expansion

All operators listed below have been implemented with full denotational
semantics, V8-optimized sink classes, and three API variants (data-first,
pipeable data-last, fluent chainable). Each operator has unit tests in
`combinators.test.ts` and integration tests in `pipe.test.ts` / `fluent.test.ts`.

## Tier 1 — High frequency, genuinely missing

- **`distinctUntilChanged(eq?)`** — Suppress consecutive duplicate values.
  Optional equality function (defaults to `===`).
  Source: `packages/core/src/combinators/distinctUntilChanged.ts`

- **`startWith(value)`** — Prepend an initial value before the first event.
  Source: `packages/core/src/combinators/startWith.ts`

- **`first(predicate?)`** — Emit first value then end. Optional predicate
  overload: emit the first value matching the predicate.
  Source: `packages/core/src/combinators/firstLast.ts`

- **`last(predicate?)`** — Emit only the final value on end. Optional
  predicate overload.
  Source: `packages/core/src/combinators/firstLast.ts`

- **`pairwise()`** — Emit `[prev, curr]` tuples starting from the second
  event. Essential for delta/diff tracking and rate-of-change calculations.
  Source: `packages/core/src/combinators/pairwise.ts`

- **`concatMap` alias** — Alias for `chain`. Naming alignment with RxJS
  conventions.
  Source: `packages/core/src/combinators/index.ts`

## Tier 2 — Real gaps, harder to compose from primitives

- **`timeout(duration)`** — Error if no emission within a time window.
  Emits `TimeoutError` via the error channel. Timer resets after each event.
  Source: `packages/core/src/combinators/timeout.ts`

- **`exhaustMap(f)`** — Ignore new outer emissions while an inner stream is
  active. The missing counterpart to `switchLatest` (cancels inner) and
  `mergeMap` (runs all concurrently).
  Source: `packages/core/src/combinators/exhaustMap.ts`

- **`forkJoin(...streams)`** — Wait for all streams to complete, emit
  array of their final values. Emits nothing if any stream completes empty.
  Source: `packages/core/src/combinators/forkJoin.ts`

- **`defaultIfEmpty(value)`** — Emit a fallback if the stream completes
  without producing any values.
  Source: `packages/core/src/combinators/defaultIfEmpty.ts`

- **`finalize(cleanup)`** — Run a side-effect function on end, error, or
  dispose. Cleanup runs exactly once.
  Source: `packages/core/src/combinators/finalize.ts`

## Tier 3 — Easy wins, convenience

- **`race(...streams)`** — First stream to emit wins, others are disposed.
  Source: `packages/core/src/combinators/race.ts`

- **`count()`** — Emit the total number of values on end.
  Source: `packages/core/src/combinators/aggregate.ts`

- **`every(pred)`** — Emit `true` on end if all values matched predicate,
  `false` as soon as one fails.
  Source: `packages/core/src/combinators/aggregate.ts`

- **`elementAt(n)`** — Emit only the nth value, then end.
  Source: `packages/core/src/combinators/aggregate.ts`

- **`range(start, count)`** — Constructor for numeric sequences. Synchronous
  fast path via `syncIterate`.
  Source: `packages/core/src/constructors.ts`

## Intentionally skipped

- `window*` variants — `bufferCount`/`bufferTime` cover real use cases.
- `groupBy` — Complex semantics, rarely needed, hard to get right.
- `publish*`/`refCount` — `multicast` and `share` already handle this.
- `audit`/`auditTime` — Too similar to throttle/debounce to justify.
