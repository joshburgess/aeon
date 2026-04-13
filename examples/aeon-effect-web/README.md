# aeon-effect-web example

Small Vite + TypeScript browser app that demonstrates a realistic `aeon-effect` use case: **live GitHub user search**.

## What it shows

Classic "live search as you type" UI, but built around the aeon + Effect split:

- **aeon** owns the input stream: `createAdapter` pushes DOM `input` events, then `debounce(300ms)` and `dedupe` filter the flood.
- **Effect** owns the HTTP program, written in canonical style:
  - `Effect.tryPromise({ try: (signal) => fetch(url, { signal }), catch: ... })`. The `AbortSignal` comes from the running fiber, so fiber interruption aborts the request at the transport layer. No manual `AbortController` plumbing.
  - Typed errors with `Data.TaggedError`: `HttpError`, `NetworkError`, `ParseError`.
  - `Schema.Struct` + `Schema.decodeUnknown` to parse the response, with `Effect.mapError` routing schema failures into `ParseError`.
  - `Data.taggedEnum` for the `SearchState` view model + `SearchState.$match` for rendering.
- **`fromStream`** glues them. `switchLatest` over the per-query inner Events disposes the previous one when a new query arrives, which interrupts the Effect fiber, which aborts the in-flight request.

The state machine (`Idle | Loading | Success | Error`) is emitted via `cons(Loading, fromStream(effect))` so each query synchronously shows "Loading" before the result lands.

## Run

From the repo root:

```bash
pnpm --filter aeon-effect-web-example dev
```

Or from this directory:

```bash
pnpm dev
```

Then open the printed URL (default http://localhost:5173).

## What to try

1. Type a partial username slowly ("ts", "tsc", "tscol"). You'll see one request land per debounced query, and the log will show `dispatch` -> `success`.
2. Type fast. The log will show prior queries being cancelled (`cancel "ts"`) as their fibers get interrupted, and only the final query will make it to `success`. Open DevTools > Network to confirm prior fetches are aborted at the transport layer.
3. Disconnect your network. You'll get a `NetworkError` branch. Reconnect. The next keystroke dispatches again.

## Key code

The whole pipeline fits in one expression:

```ts
const queries = dedupe(
  coreMap((s) => s.trim(), debounce(toDuration(300), inputEvent)),
);

const states = switchLatest(
  coreMap((q) => cons(Loading(q), fromStream(Stream.fromEffect(fetchUsers(q)))), queries),
);

observe(render, states, scheduler);
```

Everything else is HTML plumbing and a simple view function.

## Build

```bash
pnpm build
```

Produces a static bundle under `dist/`.
