# aeon-effect-cli example

A small interactive CLI that demonstrates why you'd reach for `aeon-effect` in a real project: aeon owns the user-input stream (debounce, dedupe, switchLatest), Effect owns the async work (structured concurrency and interruption), and the `fromStream` bridge glues them together.

## What it does

It's a live search prompt. Type into the terminal and each keystroke:

1. Goes into an aeon `createAdapter` push source.
2. Is debounced by 300ms (`debounce`) so rapid typing doesn't fire a search per key.
3. Is deduped (`dedupe`) so an unchanged query isn't re-run.
4. Gets mapped to an Effect program wrapped via `fromStream` / `Stream.fromEffect` and flattened with `switchLatest`. `switchLatest` disposes the previous inner Event when a new query arrives, which interrupts the in-flight Effect fiber. The program's `Effect.onInterrupt` hook fires, logging the cancellation.

The Effect program itself simulates async work with `Effect.sleep("800 millis")` and then filters a small in-memory dataset.

## Run

From the repo root:

```bash
pnpm --filter aeon-effect-cli-example start
```

Or from this directory:

```bash
pnpm start
```

## What to try

Type slowly, one query at a time, to see the happy path:

```
> react
  [effect] searching "react"...
  [result] "react" -> [react] (803ms)
```

Then type fast, adding characters before the 800ms search completes, to see cancellation:

```
> re
  [effect] searching "re"...
> red
  [effect] cancelled "re"
  [effect] searching "red"...
> redu
  [effect] cancelled "red"
  [effect] searching "redu"...
> redux
  [effect] cancelled "redu"
  [effect] searching "redux"...
  [result] "redux" -> [redux] (802ms)
```

Every intermediate fiber's `onInterrupt` handler fires exactly once, and only the last query's result reaches the observer.

## Key code

```ts
const searches = switchLatest(
  coreMap(
    (q: string) =>
      fromStream<SearchResult, never>(Stream.fromEffect(searchEffect(q))),
    dedupe(debounce(toDuration(300), input)),
  ),
);
```

That one expression is the whole pipeline. Everything else is stdin plumbing.
