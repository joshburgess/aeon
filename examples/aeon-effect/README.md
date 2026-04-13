# aeon-effect examples

Runnable walkthroughs for [`aeon-effect`](../../packages/effect).

Each file is a self-contained script executed via [`tsx`](https://github.com/privatenumber/tsx) — no build step required.

## Running

From the repo root:

```bash
pnpm --filter aeon-effect-examples ex:all          # run all three
pnpm --filter aeon-effect-examples ex:typeclasses  # just typeclass instances
pnpm --filter aeon-effect-examples ex:bridge       # just the Stream bridge
pnpm --filter aeon-effect-examples ex:newtypes     # just the Zip / Sequential newtypes
```

Or from this directory:

```bash
pnpm ex:typeclasses
```

## Contents

### `src/01-typeclasses.ts`

`Covariant.map`, `Monad.flatMap`, and `SemiApplicative.zipWith` applied to aeon events, showing how the @effect/typeclass polymorphic operators pick up the canonical instances. The `Monad.flatMap` case demonstrates the `mergeMap(Infinity)` semantics of the canonical instance: two outer ticks spawn inners whose emissions interleave.

### `src/02-bridge.ts`

Both directions of the `aeon-effect/bridge`:

- **`toStream`** — wrap an aeon `Event` as an Effect `Stream` and sum it via `Stream.runFold`; consume another one with `Stream.tap` + `Stream.runCollect` inside a full Effect program.
- **`fromStream`** — lift an Effect `Stream.fromIterable` pipeline into an aeon `Event` and observe it with aeon's `observe`.
- **Round-trip** — `fromStream ∘ toStream` preserves value order (timestamps do not round-trip).

### `src/03-newtypes.ts`

Side-by-side comparison of canonical vs newtype semantics:

- **combineLatest vs zip** — for the same two ticking sources, the canonical `Applicative` emits six pairs (each tick pairs with the other side's latest) while `Zip`'s `SemiApplicative` emits exactly `min(|a|, |b|)` pairs.
- **mergeMap vs chain** — the canonical `Monad` interleaves inner emissions concurrently; `Sequential`'s `Monad` runs each inner to completion before the next outer value fires its inner. The log output shows the concrete ordering difference.

## Expected output

The scripts print labelled lines; the newtype script makes the semantic difference between canonical and newtype most visible, e.g.:

```
[mergeMap] (concurrent)
   0.0
   0.1
   1.0       ← outer 1 starts while inner 0 is still emitting
   0.2
   1.1
   1.2

[Sequential.chain] (serial)
   0.0
   0.1
   0.2
   1.0       ← outer 1 waits until inner 0 ended
   1.1
   1.2
```
