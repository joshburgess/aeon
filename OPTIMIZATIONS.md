# Pulse Optimization Architecture

This document describes the performance optimizations in Pulse that go beyond
what @most/core provides. Each section covers the motivation, mechanism,
and where in the codebase the optimization lives.

---

## 1. Pipeline Fusion (Construction-Time)

**Files:** `packages/core/src/internal/fusion.ts`, `packages/core/src/combinators/scan.ts`,
`packages/core/src/combinators/slice.ts`, `packages/core/src/combinators/merge.ts`

At event construction time, Pulse detects fusible patterns via `instanceof`
checks on Source classes and collapses them into a single operation:

| Pattern | Optimization |
|---------|-------------|
| `map(f, map(g, s))` | `map(f . g, s)` — single composed function |
| `filter(p, filter(q, s))` | `filter(x => q(x) && p(x), s)` — conjoined predicate |
| `map(f, filter(p, s))` | `filterMap(p, f, s)` — one node does both |
| `filter(p, map(f, s))` | `mapFilter(f, p, s)` — one node does both |
| `scan(f, seed, map(g, s))` | `scan((acc, x) => f(acc, g(x)), seed, s)` — composed step function |
| `take(n, take(m, s))` | `take(min(n, m), s)` — smallest bound wins |
| `skip(n, skip(m, s))` | `skip(n + m, s)` — offsets add |
| `merge(a, merge(b, c))` | `merge(a, b, c)` — flat source array |

**Algebraic simplifications** eliminate dead pipeline nodes:

| Pattern | Optimization |
|---------|-------------|
| `map(f, empty())` | `empty()` |
| `filter(p, empty())` | `empty()` |
| `map(f, now(x))` | `now(f(x))` — constant folding |
| `filter(p, now(x))` | `p(x) ? now(x) : empty()` — constant folding |
| `take(n, empty())` | `empty()` |
| `skip(n, empty())` | `empty()` |
| `scan(f, seed, empty())` | `empty()` |

---

## 2. Sync Loop Compilation

**Files:** `packages/core/src/constructors.ts`, `packages/core/src/combinators/scan.ts`,
`packages/core/src/combinators/slice.ts`, `packages/core/src/combinators/merge.ts`,
`packages/core/src/combinators/terminal.ts`

### The problem

The standard Sink protocol dispatches every value through a chain of virtual
method calls: `source.run(sink)` → `sink.event(t, v)` → `nextSink.event(t, v)` → ...
For synchronous sources like `fromArray`, this also involves:
- A `Promise` allocation for the terminal combinator
- A `Scheduler` call for `currentTime()`
- Disposable allocation and management
- The `time` argument threaded through every call (unused for sync sources)

For `take(n)`, the Sink protocol has an additional problem: the source's
for-loop continues iterating all remaining elements even after the take
limit is reached, because the source has no way to be interrupted.

### The mechanism

Synchronous source classes implement a `syncIterate` method:

```typescript
syncIterate(emit: (value: A) => boolean): void
```

The `emit` callback returns `true` to continue or `false` to stop early.
Each source wraps the callback with its operation and delegates to its
inner source:

```
ArraySource.syncIterate(emit):
  for (let i = 0; i < values.length; i++)
    if (!emit(values[i])) return;

ScanSource.syncIterate(emit):
  let acc = seed;
  inner.syncIterate(v => { acc = f(acc, v); return emit(acc); });

TakeSource.syncIterate(emit):
  let remaining = n;
  inner.syncIterate(v => {
    remaining--;
    return emit(v) && remaining > 0;
  });

SkipSource.syncIterate(emit):
  let remaining = n;
  inner.syncIterate(v => {
    if (remaining > 0) { remaining--; return true; }
    return emit(v);
  });

MergeSource.syncIterate(emit):
  for each source: source.syncIterate(wrappedEmit);
```

Terminal combinators (reduce, drain, observe) detect the `_sync` flag on
the outermost source and switch to the fast path:

```typescript
// reduce fast path
if ((source as any)._sync === true) {
  let acc = seed;
  source.syncIterate(value => { acc = f(acc, value); return true; });
  return Promise.resolve(acc);
}
```

### What gets `_sync` and what doesn't

The `_sync: true` flag is set on:
- **Leaf sources:** ArraySource, NowSource, EmptySource, IterableSource
- **Stateful intermediates:** ScanSource, TakeSource, SkipSource, MergeSource
  (propagated from inner source)

The `_sync` flag is deliberately **not** set on:
- **MapSource, FilterSource, FilterMapSource, MapFilterSource**

This is a critical design decision. V8's monomorphic method dispatch through
the Sink protocol is faster than closure chaining for lightweight
transformations like map and filter. The closure `(v) => emit(f(v))` adds
per-element overhead that exceeds the method call overhead of
`mapSink.event(t, f(v))`. By not propagating `_sync` through map/filter
sources, pipelines like `drain(map(f, fromArray(arr)))` use the
well-optimized Sink protocol.

The sync path wins specifically for:
- **Accumulation-heavy terminals** (reduce, scan) where avoiding Promise
  overhead and sink allocation matters
- **Early exit** (take) where syncIterate short-circuits the source loop
  instead of iterating all remaining elements through a no-op sink
- **Leaf-direct terminals** (reduce(f, seed, fromArray(arr))) where the
  entire computation is a single tight loop

### Results vs @most/core (synchronous sources, 1M integers)

| Benchmark | Pulse | @most | Speedup |
|-----------|-------|-------|---------|
| drain(fromArray) | 0.36ms | 0.38ms | 1.07x |
| map | 0.52ms | 0.95ms | 1.81x |
| filter | 0.95ms | 1.13ms | 1.18x |
| filter->map->scan | 1.55ms | 1.69ms | 1.09x |
| scan | 5.54ms | 7.10ms | 1.28x |
| take(100) from 1M | 0.003ms | 6.77ms | ~2000x |
| skip(999900) | 4.28ms | 6.74ms | 1.57x |
| reduce | 5.24ms | 7.10ms | 1.35x |

The take(100) result is the standout: @most iterates all 1M values through
a TakeSink that returns early on each call, while Pulse's syncIterate
stops the source loop after exactly 100 values.

### Scope and limitations

These benchmarks measure **synchronous, in-memory sources** (`fromArray`,
`fromIterable`, `now`). The sync loop compilation path only activates when
the entire source chain has `_sync: true` — it has no effect on
asynchronous event streams (timers, user input, network events, etc.).

---

## 3. Async / Push Event Performance

**File:** `benchmarks/src/async.bench.ts`

The sync loop compilation path above only helps batch-processing workloads.
For real-time event processing (DOM events, WebSocket messages, imperative
push sources), all dispatch goes through the Sink protocol. Pulse's
monomorphic class design and `declare readonly` field pattern pay off here
too — V8 maintains stable hidden classes across the entire Sink chain,
enabling consistent inline caching.

### Results: Pulse vs @most/core vs RxJS (push-based, 100k events)

| Benchmark | Pulse | @most/core | RxJS | vs @most | vs RxJS |
|-----------|-------|-----------|------|----------|---------|
| push → filter → map → scan | 0.38ms | 1.70ms | 3.65ms | **4.4x** | **9.5x** |
| multicast fan-out (10 subs) | 6.83ms | 7.22ms | 18.19ms | **1.06x** | **2.7x** |
| mergeMap (1k × 100 inner) | 0.18ms | 0.53ms | 0.92ms | **2.9x** | **5.1x** |
| switchLatest (100 × 1k) | 0.37ms | N/A¹ | 0.81ms | — | **2.2x** |
| 10 chained maps (push) | 5.20ms | 5.39ms | 12.31ms | **1.04x** | **2.4x** |
| take(100) from push | 0.035ms | 0.025ms | 0.128ms | 0.71x² | **3.7x** |
| merge 5 push sources | 1.98ms | 2.30ms | 2.97ms | **1.16x** | **1.5x** |

¹ @most/core's `switchLatest` does not handle synchronous re-entrant switch
(all inner streams emitting synchronously within a single outer emission).

² @most/core's multicast adapter is slightly lighter for the take(100) micro-
benchmark because its `newStream`+`mostMulticast` wrapper has less per-sink
overhead than Pulse's `createAdapter`. Pulse still beats RxJS by 3.7x.

### Why Pulse is faster in the Sink protocol

1. **Monomorphic Sink classes** — each operator has its own class with
   `declare readonly` fields. V8 sees a single hidden class per operator
   type and can inline the `.event()` method call chain.

2. **No intermediate allocations** — Pulse Sink classes hold state directly
   as fields (e.g., `ScanSink.acc`). RxJS Subscriber instances carry more
   metadata (teardown logic, closed state, destination chain).

3. **Lighter multicast** — Pulse's `multicast()` uses a bare `Set<Sink>`
   with a simple for-of loop. No subscription counting, no refCount
   management, no connectable observable protocol.

4. **Direct disposal** — Pulse disposables are plain objects with a
   `dispose()` method. No teardown chain, no subscription hierarchy.
