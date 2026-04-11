# Denotational Semantics

This document defines the mathematical meaning of every type and combinator in Pulse. The implementation may differ for performance, but must be **observationally equivalent** to the denotation stated here.

## Core Types

### Event

An **Event** is a finite or infinite sequence of time-stamped values, possibly terminated by an error:

```
⟦Event<A, E>⟧ = [(Time, A)]* · (ε | Error(E))
```

- Each `(t, v)` pair represents a value `v` occurring at time `t`.
- Times are non-decreasing: if `(t₁, v₁)` precedes `(t₂, v₂)`, then `t₁ ≤ t₂`.
- The sequence ends with either nothing (normal completion) or an error `E`.
- `E = never` means the stream provably cannot fail.

### Behavior

A **Behavior** is a continuous function from time to a value:

```
⟦Behavior<A, E>⟧ = Time → A
```

Unlike Events, Behaviors have a value at every point in time. They are evaluated lazily when sampled, not eagerly when time advances.

### Time, Duration, Offset

- **Time**: An absolute point in time (milliseconds). Branded to prevent mixing with raw numbers.
- **Duration**: A relative span between two times.
- **Offset**: A scheduler-relative shift.

## Event Constructors

| Constructor | Denotation |
|---|---|
| `empty()` | `[]` — the empty sequence |
| `never()` | `⊥` — never emits, never ends |
| `now(x)` | `[(0, x)]` — one value at time 0 |
| `at(t, x)` | `[(t, x)]` — one value at time `t` |
| `fromArray(xs)` | `[(t, xs[0]), (t, xs[1]), ...]` — all at current time |
| `fromIterable(iter)` | `[(t, v) for v in iter]` — all at current time |
| `periodic(d)` | `[(d, undefined), (2d, undefined), ...]` — infinite, period `d` |

## Event Combinators

### Functor

| Combinator | Denotation | Laws |
|---|---|---|
| `map(f, e)` | `[(t, f(v)) \| (t, v) ∈ e]` | Identity: `map(id, e) ≡ e` |
| | | Composition: `map(f ∘ g, e) ≡ map(f, map(g, e))` |

### Filterable

| Combinator | Denotation |
|---|---|
| `filter(p, e)` | `[(t, v) \| (t, v) ∈ e, p(v)]` |

### Transform

| Combinator | Denotation |
|---|---|
| `tap(f, e)` | `e` — identity on the event sequence; `f` is a side effect |
| `constant(c, e)` | `[(t, c) \| (t, _) ∈ e]` |
| `scan(f, seed, e)` | `[(t₁, f(seed, v₁)), (t₂, f(f(seed, v₁), v₂)), ...]` |

### Slicing

| Combinator | Denotation |
|---|---|
| `take(n, e)` | First `n` values of `e`, then end |
| `skip(n, e)` | Drop first `n` values, then all remaining |
| `takeWhile(p, e)` | Values while `p(v)` holds, then end |
| `skipWhile(p, e)` | Drop while `p(v)` holds, then all remaining |
| `slice(s, end, e)` | `take(end - s, skip(s, e))` |
| `until(signal, e)` | `[(t, v) \| (t, v) ∈ e, t < t_signal]` |
| `since(signal, e)` | `[(t, v) \| (t, v) ∈ e, t ≥ t_signal]` |

### Combining

| Combinator | Denotation |
|---|---|
| `merge(e₁, e₂, ...)` | Union of all values, sorted by time. Ends when all end. |
| `combine(f, eₐ, eᵦ)` | `[(t, f(aₜ, bₜ))]` — emits when either fires, using latest of both |
| `zip(eₐ, eᵦ)` | `[(t, [aᵢ, bᵢ])]` — pairs by index, truncates to shorter |

### Higher-Order

| Combinator | Denotation |
|---|---|
| `switchLatest(ee)` | At each `(t, inner) ∈ ee`, switch to `inner`. Only the latest inner stream's values propagate. |
| `chain(f, e)` | `concat [f(v) \| (t, v) ∈ e]` — sequential flatMap |
| `mergeMapConcurrently(f, c, e)` | Like `merge(map(f, e))` but with at most `c` active inner streams |
| `mapAsync(f, c, e)` | `[(t, await f(v)) \| (t, v) ∈ e]` with bounded concurrency `c` |

### Error Handling

| Combinator | Denotation | Type Change |
|---|---|---|
| `throwError(err)` | Immediately error with `err` | Creates `Event<A, E>` |
| `catchError(h, e)` | On error `err`, switch to `h(err)` | `E₁ → E₂` |
| `mapError(f, e)` | Transform error: if `e` errors with `err`, error with `f(err)` | `E₁ → E₂` |

**Law**: `catchError(h, throwError(e)) ≡ h(e)`

### Time

| Combinator | Denotation |
|---|---|
| `debounce(d, e)` | Emit latest value after `d` ms of silence |
| `throttle(d, e)` | Emit at most once per `d` ms window |
| `delay(d, e)` | `[(t + d, v) \| (t, v) ∈ e]` |
| `bufferCount(n, e)` | Accumulate into arrays of size `n` |
| `bufferTime(d, e)` | Accumulate over `d` ms windows |

### Terminal (activate the stream)

| Combinator | Returns | Denotation |
|---|---|---|
| `reduce(f, seed, e)` | `Promise<B>` | `foldl f seed (values of e)` |
| `observe(f, e)` | `Promise<void>` | Execute `f` for each value |
| `drain(e)` | `Promise<void>` | Activate, discard all values |

## Behavior Constructors

| Constructor | Denotation |
|---|---|
| `constantB(x)` | `t → x` |
| `fromFunction(f)` | `f` — the function itself |
| `time` | `t → t` — the identity |
| `pureB(x)` | `t → x` — alias for `constantB` |

## Behavior Combinators

| Combinator | Denotation | Laws |
|---|---|---|
| `mapB(f, b)` | `t → f(b(t))` | Functor identity and composition |
| `liftA2B(f, bₐ, bᵦ)` | `t → f(bₐ(t), bᵦ(t))` | Applicative laws |
| `liftA3B(f, bₐ, bᵦ, b꜀)` | `t → f(bₐ(t), bᵦ(t), b꜀(t))` | |
| `integral(b, dt)` | `t → ∫₀ᵗ b(s) ds` (trapezoidal approximation) | |

## Event ↔ Behavior Bridge

| Combinator | Denotation |
|---|---|
| `stepper(init, e)` | `t → latestValue(e, t)` or `init` if none. Push-updated, pull-sampled. |
| `sample(b, sampler)` | `[(t, b(t)) \| (t, _) ∈ sampler]` |
| `snapshot(f, b, e)` | `[(t, f(b(t), v)) \| (t, v) ∈ e]` |
| `switcher(init, e)` | Dynamic behavior: holds `init`, switches to carried Behavior on each event. |

**Laws**:
- `sample(constantB(x), e) ≡ map(() => x, e)`
- `sample(mapB(f, b), e) ≡ map(f, sample(b, e))`

## Pipeline Fusion

At construction time, Pulse detects and collapses fusible patterns. These are observationally equivalent to the unfused forms:

| Pattern | Fused Form |
|---|---|
| `map(f, map(g, s))` | `map(f ∘ g, s)` |
| `filter(p, filter(q, s))` | `filter(x → q(x) ∧ p(x), s)` |
| `map(f, filter(p, s))` | `filterMap(p, f, s)` |
| `filter(p, map(f, s))` | `mapFilter(f, p, s)` |
| `scan(f, seed, map(g, s))` | `scan((acc, x) → f(acc, g(x)), seed, s)` |
| `take(n, take(m, s))` | `take(min(n, m), s)` |
| `skip(n, skip(m, s))` | `skip(n + m, s)` |
| `merge(a, merge(b, c))` | `merge(a, b, c)` |

Algebraic simplifications on trivial sources:

| Pattern | Result |
|---|---|
| `map(f, empty())` | `empty()` |
| `filter(p, empty())` | `empty()` |
| `map(f, now(x))` | `now(f(x))` |
| `filter(p, now(x))` | `p(x) ? now(x) : empty()` |
