# aeon-effect

[Effect](https://effect.website) ecosystem integration for [Aeon](https://github.com/joshburgess/aeon). Provides lawful `@effect/typeclass` instances over aeon's `Event<A, E>` and a bidirectional bridge to Effect's `Stream<A, E, R>`.

- **`aeon-effect/Event`** — canonical typeclass instances: `Covariant`, `Of`, `Pointed`, `FlatMap`, `Monad`, `SemiProduct`, `Product`, `SemiApplicative`, `Applicative`, `Filterable`
- **`aeon-effect/Event/Zip`** — newtype exposing pairwise `zip` as a `SemiApplicative` (no lawful `of`)
- **`aeon-effect/Event/Sequential`** — newtype exposing `chain` (sequential `flatMap`) as a `Monad`
- **`aeon-effect/bridge`** — `toStream` / `fromStream` adapters

All typeclass instances are property-tested against the standard laws using `@effect/vitest` + fast-check shrinking; see `packages/effect/test/laws/`.

## Installation

```bash
pnpm add aeon-core aeon-scheduler aeon-effect effect @effect/typeclass
```

`effect` and `@effect/typeclass` are peer dependencies.

## Canonical instance choices

Two operations admit more than one lawful choice; aeon-effect picks the one whose `Applicative`/`Monad` is well-behaved and exposes the other behind a newtype:

| Typeclass      | Canonical (`aeon-effect/Event`) | Newtype (`Event/Zip`, `Event/Sequential`) |
| -------------- | ------------------------------- | ----------------------------------------- |
| `Applicative`  | `combineLatest` — `of(x)` is lawful identity because a `now(x)` sample is held forever | `Zip` (`SemiApplicative` only — pairwise `zip` has no lawful identity) |
| `Monad`        | `mergeMap(Infinity)` — inners run concurrently | `Sequential` — `chain` (concatMap) runs inners to completion in order |

## Typeclass usage

```typescript
import * as SemiApplicative from "@effect/typeclass/SemiApplicative";
import { fromArray, observe } from "aeon-core";
import { Applicative, Covariant, Monad } from "aeon-effect/Event";
import { DefaultScheduler } from "aeon-scheduler";

const scheduler = new DefaultScheduler();

// Covariant.map — same semantics as aeon-core's map, reached via the
// @effect/typeclass instance.
const doubled = Covariant.map(fromArray([1, 2, 3]), (n) => n * 2);
await observe(console.log, doubled, scheduler); // 2, 4, 6

// Monad.flatMap — canonical mergeMap(Infinity). Inner streams run
// concurrently; their outputs interleave in arrival order.
const flat = Monad.flatMap(fromArray([1, 2, 3]), (n) => fromArray([n, n * 10]));
await observe(console.log, flat, scheduler); // 1, 10, 2, 20, 3, 30

// SemiApplicative.zipWith is derived from product + map. For the canonical
// Applicative, product is combineLatest.
const zipWith = SemiApplicative.zipWith(Applicative);
const paired = zipWith(fromArray([1, 2, 3]), fromArray(["a", "b"]), (n, s) => `${n}-${s}`);
```

## Bridging to Effect `Stream`

```typescript
import { Effect, Stream } from "effect";
import { fromArray } from "aeon-core";
import { toStream, fromStream } from "aeon-effect/bridge";
import { DefaultScheduler } from "aeon-scheduler";

const scheduler = new DefaultScheduler();

// aeon Event -> Effect Stream: the aeon subscription is acquired inside
// Effect.acquireRelease, so interrupting the Stream disposes it.
const stream = toStream(fromArray([1, 2, 3]), scheduler);
const total = await Effect.runPromise(
  Stream.runFold(stream, 0, (acc, n) => acc + n),
); // 6

// Effect Stream -> aeon Event: each subscription forks an Effect fiber
// that pushes emissions to the aeon sink using the scheduler's clock;
// disposing the subscription interrupts the fiber.
const event = fromStream<number, never>(Stream.fromIterable([10, 20, 30]));
```

The bridge preserves **values and ordering** in both directions. Emission **timestamps** do not round-trip — Effect `Stream` has no notion of discrete emission time, so `fromStream ∘ toStream` normalizes to the scheduler's clock.

## Newtype usage

```typescript
import { observe } from "aeon-core";
import {
  SemiApplicative as ZipSemiApplicative,
  fromEvent as fromEventZip,
  toEvent as toEventZip,
} from "aeon-effect/Event/Zip";
import {
  Monad as SequentialMonad,
  fromEvent as fromEventSeq,
  toEvent as toEventSeq,
} from "aeon-effect/Event/Sequential";

// `Zip` exposes pairwise zip as a SemiApplicative. `fromEvent` / `toEvent`
// cast in and out of the brand — they're zero-cost at runtime.
const a = fromEventZip(/* Event<number> */);
const b = fromEventZip(/* Event<string> */);
const zipped = toEventZip(ZipSemiApplicative.product(a, b)); // Event<[number, string]>

// `Sequential` exposes chain (concatMap) as a Monad. Inners run
// sequentially — each outer value waits for the previous inner to end.
const m = fromEventSeq(/* Event<number> */);
const serial = toEventSeq(
  SequentialMonad.flatMap(m, (n) => fromEventSeq(/* Event<string> */)),
);
```

## Runnable examples

Three runnable walkthroughs live under [`examples/aeon-effect/`](../../examples/aeon-effect) covering typeclasses, the bridge, and the newtypes. From the repo root:

```bash
pnpm --filter aeon-effect-examples ex:all
```

## Law testing

Every typeclass instance is checked against its canonical laws using `@effect/vitest`'s property-based `prop` helper. The harness under `test/laws/` is generic over `TypeLambda` and can be reused to test any other typeclass instance whose values can be cast to an aeon `Event` for comparison.

`Sequential`'s `Monad` associativity is tested against a **sequence-only** equality, not strict timed-entry equality — chain-based timed monads satisfy associativity up to event order but not pointwise in time, since different nestings interleave "next outer start" with "current inner downstream" differently.

## Documentation

- [Main README](https://github.com/joshburgess/aeon#readme)
- [aeon-core](https://github.com/joshburgess/aeon/tree/main/packages/core)
- [Effect docs](https://effect.website)

## License

MIT
