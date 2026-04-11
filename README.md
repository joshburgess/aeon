# Project: Pulse — A Denotationally-Designed Reactive Programming Library for TypeScript

## Vision

The first TypeScript reactive library with:
- Proper denotational semantics (Behaviors as `Time → A`, Events as `[(Time, A)]`)
- Higher-kinded type abstractions (Functor, Applicative, Monad over both Behaviors and Events)
- Typed error channels (`Event<A, E>`, `Behavior<A, E>`)
- Most.js-class synchronous push propagation for discrete events
- Lazy pull-based evaluation for continuous-time Behaviors
- Hybrid push-pull architecture at async boundaries

## Repository Structure

```
pulse/
├── packages/
│   ├── types/          # Core interfaces, HKT encoding, branded types
│   ├── core/           # Event and Behavior implementations, combinators
│   ├── scheduler/      # Tiered scheduler (micro/macro/raf/idle)
│   ├── test/           # Virtual time scheduler, marble testing, property-based tests
│   ├── dom/            # DOM event sources, animation frame behaviors
│   ├── adapter/        # Imperative push adapter (Subject equivalent)
│   └── devtools/       # Debug instrumentation, stream graph inspection
├── benchmarks/         # Perf suite comparing against most.js, rxjs, etc.
├── docs/               # Denotational semantics spec, API docs, guides
└── examples/           # Real-world usage examples
```

## Conventions for All Phases

- TypeScript strict mode, no `any` escapes
- Every public function has a JSDoc comment stating its denotational meaning
- Every combinator has a property-based test (fast-check) verifying its semantic law
- Every phase ends with benchmarks run and results recorded
- Monorepo managed with pnpm workspaces
- Build with tsup (esbuild under the hood) for speed
- Test with vitest
- Lint with biome

---

## Phase 0: Foundation — Monorepo, HKT Encoding, Branded Types

**Goal:** Establish the project skeleton and the type-level machinery everything else depends on. No runtime behavior yet — this is pure types.

### Iteration 0.1: Monorepo scaffold

- [ ] Initialize pnpm workspace with `packages/types`, `packages/core`, `packages/scheduler`, `packages/test`, `benchmarks`
- [ ] Configure tsconfig base with strict mode, composite projects, path aliases
- [ ] Configure tsup for each package (ESM + CJS dual output)
- [ ] Configure vitest with workspace support
- [ ] Configure biome for linting and formatting
- [ ] Add CI config (GitHub Actions): lint, typecheck, test, build
- [ ] Add a README.md with project vision statement

### Iteration 0.2: Branded types (`packages/types`)

- [ ] Define branded `Time` type: `type Time = number & { readonly _brand: unique symbol }`
- [ ] Define branded `Duration` type (for delays/periods)
- [ ] Define branded `Offset` type (for relative scheduler offsets)
- [ ] Utility functions: `toTime(ms: number): Time`, `timeDiff(a: Time, b: Time): Duration`
- [ ] Unit tests verifying branded types prevent accidental mixing at compile time (should-fail type tests using `tsd` or `expect-type`)

### Iteration 0.3: HKT encoding (`packages/types`)

- [ ] Define the URI-to-Kind map using module augmentation (Effect-TS style):
  ```typescript
  interface URItoKind<A, E> {}
  type URIS = keyof URItoKind<any, any>
  type Kind<F extends URIS, A, E = never> = URItoKind<A, E>[F]
  ```
- [ ] Define typeclass interfaces:
  - `Functor<F>` with `map`
  - `Applicative<F>` with `of`, `ap`
  - `Monad<F>` with `chain` (flatMap)
  - `Filterable<F>` with `filter`
- [ ] Derive `liftA2`, `liftA3` from Applicative generically
- [ ] Type-level tests: verify that `Kind<'Event', number, string>` resolves to `Event<number, string>` (once registered)
- [ ] Type-level tests: verify `map` signature is correctly inferred for a dummy registered type

### Iteration 0.4: Core interfaces (`packages/types`)

- [ ] Define `Sink<A, E = never>`:
  ```typescript
  interface Sink<A, E = never> {
    event(time: Time, value: A): void
    error(time: Time, err: E): void
    end(time: Time): void
  }
  ```
- [ ] Define `Source<A, E = never>`:
  ```typescript
  interface Source<A, E = never> {
    run(sink: Sink<A, E>, scheduler: Scheduler): Disposable
  }
  ```
- [ ] Define `Disposable`:
  ```typescript
  interface Disposable {
    dispose(): void
  }
  ```
- [ ] Define `Scheduler` interface (method signatures only, implementation in Phase 2):
  ```typescript
  interface Scheduler {
    currentTime(): Time
    scheduleTask(delay: Duration, task: Task): ScheduledTask
    relative(offset: Offset): Scheduler
    cancelTask(task: ScheduledTask): void
  }
  ```
- [ ] Define the opaque `Event<A, E>` and `Behavior<A, E>` types:
  ```typescript
  declare const EventBrand: unique symbol
  type Event<A, E = never> = { readonly [EventBrand]: [A, E] }

  declare const BehaviorBrand: unique symbol
  type Behavior<A, E = never> = { readonly [BehaviorBrand]: [A, E] }
  ```
- [ ] Register Event and Behavior in URItoKind via module augmentation
- [ ] Type-level tests: `Kind<'Event', number, string>` is `Event<number, string>`, etc.

**Exit criteria:** `pnpm typecheck` passes. All type-level tests pass. No runtime code yet — just types that compile.

---

## Phase 1: Event Streams — Most.js-Class Push Propagation

**Goal:** Implement discrete Event streams with synchronous call-stack propagation matching Most.js architecture. No Behaviors yet.

### Iteration 1.1: Internal Event representation

- [ ] Define internal `EventStream<A, E>` class that implements `Source<A, E>` and is wrapped by the opaque `Event<A, E>` type
- [ ] Factory: `_createEvent<A, E>(source: Source<A, E>): Event<A, E>` (internal, not exported to users)
- [ ] Accessor: `_getSource<A, E>(event: Event<A, E>): Source<A, E>` (internal)
- [ ] Ensure the opaque type boundary: users cannot access Source/Sink directly

### Iteration 1.2: Event constructors

- [ ] `empty<A>(): Event<A, never>` — ends immediately
- [ ] `never<A>(): Event<A, never>` — never emits, never ends
- [ ] `now<A>(value: A): Event<A, never>` — emits one value at time 0, then ends
- [ ] `at<A>(time: Time, value: A): Event<A, never>` — emits one value at a specific time
- [ ] `fromArray<A>(values: A[]): Event<A, never>` — emits all values synchronously, then ends
- [ ] `periodic(period: Duration): Event<undefined, never>` — emits undefined at regular intervals
- [ ] Unit tests for each constructor using a mock/test scheduler (can be simple manual impl for now)

### Iteration 1.3: Core combinators (Functor/Filterable)

Each combinator is a standalone function. Each combinator's Sink implementation must:
- Initialize ALL properties in the constructor (V8 hidden class stability)
- Be a single concrete class (monomorphic — no inheritance)

Implement:
- [ ] `map<A, B, E>(f: (a: A) => B, event: Event<A, E>): Event<B, E>`
  - Sink: MapSink with fields `sink`, `f` — calls `this.sink.event(time, this.f(value))`
- [ ] `filter<A, E>(predicate: (a: A) => boolean, event: Event<A, E>): Event<A, E>`
  - Sink: FilterSink with fields `sink`, `predicate`
- [ ] `tap<A, E>(f: (a: A) => void, event: Event<A, E>): Event<A, E>`
  - Sink: TapSink — runs side effect, propagates unchanged
- [ ] `constant<A, B, E>(value: B, event: Event<A, E>): Event<B, E>`
  - Implemented as `map(() => value, event)` — but verify map∘map fusion kicks in later
- [ ] Verify Functor laws with property-based tests:
  - Identity: `map(id, e) ≡ e`
  - Composition: `map(f ∘ g, e) ≡ map(f, map(g, e))`

### Iteration 1.4: Folding and reduction

- [ ] `scan<A, B, E>(f: (acc: B, a: A) => B, seed: B, event: Event<A, E>): Event<B, E>`
- [ ] `reduce<A, B, E>(f: (acc: B, a: A) => B, seed: B, event: Event<A, E>): Promise<B>`
  - Terminal combinator — activates the stream
- [ ] `observe<A, E>(f: (a: A) => void, event: Event<A, E>): Promise<void>`
  - Terminal combinator
- [ ] `drain<A, E>(event: Event<A, E>): Promise<void>`
  - Terminal combinator — activates but discards values

### Iteration 1.5: Slicing

- [ ] `take<A, E>(n: number, event: Event<A, E>): Event<A, E>`
- [ ] `skip<A, E>(n: number, event: Event<A, E>): Event<A, E>`
- [ ] `takeWhile<A, E>(predicate: (a: A) => boolean, event: Event<A, E>): Event<A, E>`
- [ ] `skipWhile<A, E>(predicate: (a: A) => boolean, event: Event<A, E>): Event<A, E>`
- [ ] `until<A, E>(signal: Event<any, any>, event: Event<A, E>): Event<A, E>`
- [ ] `since<A, E>(signal: Event<any, any>, event: Event<A, E>): Event<A, E>`
- [ ] `slice<A, E>(start: number, end: number, event: Event<A, E>): Event<A, E>`

### Iteration 1.6: Combining

- [ ] `merge<A, E>(...events: Event<A, E>[]): Event<A, E>`
- [ ] `combine<A, B, C, E>(f: (a: A, b: B) => C, ea: Event<A, E>, eb: Event<B, E>): Event<C, E>`
- [ ] `zip<A, B, E>(ea: Event<A, E>, eb: Event<B, E>): Event<[A, B], E>`
- [ ] `switchLatest<A, E>(event: Event<Event<A, E>, E>): Event<A, E>`
- [ ] `mergeMapConcurrently<A, B, E>(f: (a: A) => Event<B, E>, concurrency: number, event: Event<A, E>): Event<B, E>`

### Iteration 1.7: Error handling (typed error channel)

- [ ] `catchError<A, E1, E2>(handler: (err: E1) => Event<A, E2>, event: Event<A, E1>): Event<A, E2>`
  - The error type CHANGES — this is the whole point of typed errors
- [ ] `mapError<A, E1, E2>(f: (err: E1) => E2, event: Event<A, E1>): Event<A, E2>`
- [ ] `throwError<A, E>(err: E): Event<A, E>`
- [ ] Verify: `catchError(handler, throwError(e))` is equivalent to `handler(e)` (property test)
- [ ] Verify: an event with `E = never` cannot have catchError called on it without a type error (type-level test)

### Iteration 1.8: Monad instance and chain

- [ ] `chain<A, B, E>(f: (a: A) => Event<B, E>, event: Event<A, E>): Event<B, E>`
  - This is flatMap/concatMap semantics
- [ ] Register Event's Functor, Applicative, Monad instances with the HKT system
- [ ] Verify Monad laws with property-based tests:
  - Left identity: `chain(f, of(a)) ≡ f(a)`
  - Right identity: `chain(of, m) ≡ m`
  - Associativity: `chain(g, chain(f, m)) ≡ chain(x => chain(g, f(x)), m)`

### Iteration 1.9: Map-map fusion optimization

- [ ] Detect `map(f, map(g, source))` at construction time
- [ ] Compose `f` and `g` into a single function, emit a single MapSink
- [ ] Extend to `filter(p, map(f, source))` → FilterMapSink
- [ ] Extend to `map(f, filter(p, source))` → MapFilterSink
- [ ] Benchmark: compare fused vs unfused on 1M-element fromArray pipeline

### Iteration 1.10: First benchmark suite

- [ ] Set up benchmark harness in `benchmarks/` using `tinybench` or `benchmark.js`
- [ ] Implement the same benchmarks Most.js uses:
  - `filter → map → reduce` over 1M integers
  - `flatMap` over 1000 × 1000 streams
  - `merge` of 100 streams
  - `zip` of two 1M streams
  - `scan` over 1M integers
- [ ] Run against most.js and rxjs (installed as devDependencies in benchmarks package)
- [ ] Record baseline numbers

**Exit criteria:** All benchmarks run. Performance is within 2× of Most.js on filter→map→reduce. All combinator laws verified. Typed error channel works end-to-end.

---

## Phase 2: Scheduler

**Goal:** Production-quality scheduler with tiered execution and a virtual-time test scheduler.

### Iteration 2.1: Clock abstraction

- [ ] Define `Clock` interface: `{ now(): Time }`
- [ ] Implement `PerformanceClock` using `performance.now()`
- [ ] Implement `DateClock` using `Date.now()` (fallback)
- [ ] Implement `VirtualClock` for testing (manually advanceable)

### Iteration 2.2: Timer queue with binary heap

- [ ] Implement a min-heap (`BinaryHeap<ScheduledTask>`) keyed on scheduled time
- [ ] Operations: `insert` O(log n), `extractMin` O(log n), `peek` O(1), `remove` O(log n)
- [ ] Use a pre-allocated backing array (arena-style) to avoid per-node allocation
- [ ] Unit tests: insert/extract ordering, remove correctness, heap property maintained

### Iteration 2.3: Default scheduler (`packages/scheduler`)

- [ ] Implement `DefaultScheduler` fulfilling the `Scheduler` interface from Phase 0
- [ ] Uses PerformanceClock
- [ ] Timer queue for delayed tasks
- [ ] `relative(offset)` returns a new Scheduler whose time is shifted
- [ ] Microtask batching: accumulate tasks scheduled for "now" and flush in a single `queueMicrotask` call
- [ ] Integration test: schedule 10k tasks at various delays, verify execution order and timing

### Iteration 2.4: Tiered scheduling

- [ ] `SchedulerTier` enum: `Microtask`, `Macrotask`, `AnimationFrame`, `Idle`
- [ ] `scheduleTier(tier: SchedulerTier, task: Task): ScheduledTask`
  - Microtask → `queueMicrotask`
  - Macrotask → `MessageChannel` (preferred) or `setTimeout(0)`
  - AnimationFrame → `requestAnimationFrame`
  - Idle → `requestIdleCallback`
- [ ] Allow combinators to specify preferred tier (e.g., `observeOn(tier, event)`)

### Iteration 2.5: Virtual time scheduler (`packages/test`)

- [ ] `VirtualScheduler` backed by `VirtualClock`
- [ ] `advance(duration: Duration)`: manually advance time, executing all tasks in range
- [ ] `advanceTo(time: Time)`: advance to exact time
- [ ] `flush()`: execute all pending tasks regardless of time
- [ ] No real async — everything runs synchronously for deterministic tests
- [ ] Integration test: build an event pipeline, advance virtual time, verify exact output sequence

**Exit criteria:** Default scheduler passes all integration tests. Virtual scheduler enables fully deterministic testing of time-dependent streams.

---

## Phase 3: Behaviors — Continuous-Time Semantics

**Goal:** Implement Behaviors with proper `Time → A` denotational semantics and the hybrid push-pull evaluation strategy.

### Iteration 3.1: Internal Behavior representation

- [ ] Define internal representation as a discriminated union:
  ```typescript
  type BehaviorImpl<A, E> =
    | { tag: 'constant', value: A }
    | { tag: 'function', f: (time: Time) => A }
    | { tag: 'stepper', initial: A, latestValue: A, latestTime: Time }
    | { tag: 'lift2', f: (a: A1, b: A2) => A, ba: BehaviorImpl<A1, E>, bb: BehaviorImpl<A2, E> }
  ```
- [ ] `sample(behavior: Behavior<A, E>, time: Time): A` — evaluates the behavior at a point in time
  - For `constant`: return value
  - For `function`: call `f(time)`
  - For `stepper`: return `latestValue`
  - For `lift2`: recursively sample both inputs, apply `f`

### Iteration 3.2: Behavior constructors

- [ ] `constant<A>(value: A): Behavior<A, never>` — denotation: `t => value`
- [ ] `fromFunction<A>(f: (time: Time) => A): Behavior<A, never>` — denotation: `f` itself
- [ ] `time: Behavior<Time, never>` — denotation: identity function `t => t`

### Iteration 3.3: Behavior ↔ Event bridge (the critical operations)

- [ ] `stepper<A, E>(initial: A, event: Event<A, E>): Behavior<A, E>`
  - Creates a Behavior that holds the latest value from the event stream
  - Denotation: `t => latestEventValueBefore(t)` or `initial` if none
  - Implementation: push-updated cache — subscribes to the event, stores latest value
- [ ] `sample<A, B, E>(behavior: Behavior<A, E>, sampler: Event<B, E>): Event<A, E>`
  - Each time the sampler emits, read the current value of the behavior
  - Denotation: `[(t, sample(behavior, t)) | (t, _) ∈ sampler]`
- [ ] `snapshot<A, B, C, E>(f: (a: A, b: B) => C, behavior: Behavior<A, E>, event: Event<B, E>): Event<C, E>`
  - Like sample but combines the behavior value with the event value
- [ ] `switcher<A, E>(initial: Behavior<A, E>, event: Event<Behavior<A, E>, E>): Behavior<A, E>`
  - Dynamic behavior switching: holds `initial` until first event, then switches to the carried behavior
- [ ] Property tests:
  - `sample(constant(x), e)` is equivalent to `map(() => x, e)`
  - `sample(stepper(init, e1), e2)` yields the latest e1 value at each e2 time

### Iteration 3.4: Behavior Functor and Applicative

- [ ] `mapB<A, B, E>(f: (a: A) => B, b: Behavior<A, E>): Behavior<B, E>`
  - Denotation: `t => f(b(t))`
  - Implementation: for `constant`, eagerly apply. For `function`, compose. For `stepper`, wrap.
- [ ] `liftA2B<A, B, C, E>(f: (a: A, b: B) => C, ba: Behavior<A, E>, bb: Behavior<B, E>): Behavior<C, E>`
  - Denotation: `t => f(ba(t), bb(t))`
  - Implementation: `lift2` node — lazily evaluated when sampled
- [ ] `pureB<A>(value: A): Behavior<A, never>`
  - Same as `constant`
- [ ] Register Behavior's Functor and Applicative with HKT system
- [ ] Applicative law tests:
  - Identity: `liftA2B(id, b) ≡ b` (where id is lifted appropriately)
  - Composition, Interchange, Homomorphism

### Iteration 3.5: Dirty-flag optimization for lifted Behaviors

- [ ] Add `dirty: boolean` flag to stepper-based and lift2-based Behavior nodes
- [ ] When a stepper receives a new event value, mark itself and all downstream lift2 nodes as dirty
- [ ] When sampling a lift2 node that is NOT dirty, return cached value without recomputing
- [ ] When sampling a lift2 node that IS dirty, recompute from inputs, cache result, clear flag
- [ ] Benchmark: liftA2 of two steppers sampled at 60fps — measure with and without dirty-flag optimization

### Iteration 3.6: Integration (numerical integration of Behaviors)

- [ ] `integral(behavior: Behavior<number, never>, dt: Duration): Behavior<number, never>`
  - Uses adaptive step-size integration (start with simple trapezoidal, upgrade to RK4 later)
  - The consumer's sampling rate and the integration step size are decoupled
- [ ] Test: `integral(constant(1))` should yield a Behavior approximating `t => t`
- [ ] Test: `integral(fromFunction(t => t))` should approximate `t => t²/2`

**Exit criteria:** Behaviors work end-to-end. Stepper bridges events to behaviors. Sample bridges behaviors to events. Dirty-flag optimization measurably reduces computation. Applicative laws verified.

---

## Phase 4: Advanced Optimizations

**Goal:** Close the performance gap with (or surpass) Most.js through engine-level optimizations.

### Iteration 4.1: Pipeline fusion IR

- [ ] At Event construction time, instead of immediately creating Sink chains, build a lightweight intermediate representation (IR) of the pipeline:
  ```typescript
  type PipelineNode =
    | { tag: 'source', source: Source<any, any> }
    | { tag: 'map', f: Function, input: PipelineNode }
    | { tag: 'filter', predicate: Function, input: PipelineNode }
    | { tag: 'take', n: number, input: PipelineNode }
    | { tag: 'scan', f: Function, seed: any, input: PipelineNode }
    // ...
  ```
- [ ] Fusion pass: walk the IR and collapse adjacent compatible nodes
  - map∘map → single map with composed function
  - filter∘filter → single filter with conjoined predicate
  - filter∘map → single filterMap node
  - map∘filter → single mapFilter node
  - take∘filter → single takePredicate node
- [ ] Compile the fused IR into a minimal Sink chain
- [ ] Benchmark: measure allocation count and throughput with fusion vs without

### Iteration 4.2: Zero-allocation fast path for fromArray pipelines

- [ ] Detect the pattern: `fromArray(arr)` followed by any chain of map/filter/take/reduce
- [ ] Instead of building a Sink chain, compile to a single `for` loop that applies all operations inline
- [ ] This bypasses the entire Source/Sink mechanism for synchronous array processing
- [ ] Benchmark: compare against Most.js's fromArray→map→filter→reduce

### Iteration 4.3: Object pooling for Sinks

- [ ] Implement a simple typed object pool: `Pool<T>`
  - `acquire(): T` — return from pool or allocate new
  - `release(obj: T): void` — return to pool
- [ ] Add `reset()` method to all Sink classes
- [ ] When a stream ends or is disposed, release Sinks back to their pools
- [ ] Measure GC pause reduction under repeated subscribe/unsubscribe cycles

### Iteration 4.4: Monomorphism audit

- [ ] Run the full benchmark suite under Node with `--trace-ic` flag
- [ ] Identify any polymorphic or megamorphic call sites in hot paths
- [ ] Refactor to ensure all hot-path method calls are monomorphic:
  - Each Sink's `event()` should only be called from one specific callsite
  - No base class / interface dispatch in the hot loop
- [ ] Re-run `--trace-ic`, verify all hot paths show monomorphic state
- [ ] Record throughput improvement

### Iteration 4.5: Comprehensive benchmark suite

- [ ] All Most.js perf benchmarks (filter-map-reduce, flatMap, merge, zip, scan, slice, skipRepeats)
- [ ] Behavior-specific benchmarks:
  - Sample a liftA2 behavior at 60fps for 10 seconds
  - Stepper with 1M events, sampled at 1000 points
  - Switcher with 1000 behavior switches
- [ ] Memory benchmarks: measure peak heap and GC pause times
- [ ] Compare against: most.js, @most/core, rxjs, xstream
- [ ] Generate a markdown report with tables and analysis

**Exit criteria:** Performance meets or exceeds Most.js on all discrete event benchmarks. Behavior sampling overhead is sub-microsecond for cached values.

---

## Phase 5: Backpressure and Async

**Goal:** Add async backpressure support at async boundaries while preserving synchronous push performance.

### Iteration 5.1: AsyncEvent type

- [ ] Define `AsyncEvent<A, E>` — an event stream that supports backpressure via async pull
- [ ] Interface: the consumer signals demand (credits), the producer emits up to N events then waits
- [ ] Conversion: `toAsync<A, E>(event: Event<A, E>, bufferSize: number): AsyncEvent<A, E>`
  - Buffers up to `bufferSize` events; pauses the source when buffer is full
- [ ] Conversion: `fromAsync<A, E>(async: AsyncEvent<A, E>): Event<A, E>`
  - Drains the async source as fast as it can produce

### Iteration 5.2: Async combinators

- [ ] `mapAsync<A, B, E>(f: (a: A) => Promise<B>, concurrency: number, event: Event<A, E>): Event<B, E>`
  - Applies an async function with bounded concurrency
  - Backpressure: when `concurrency` slots are full, stop pulling from source
- [ ] `debounce<A, E>(duration: Duration, event: Event<A, E>): Event<A, E>`
- [ ] `throttle<A, E>(duration: Duration, event: Event<A, E>): Event<A, E>`
- [ ] `delay<A, E>(duration: Duration, event: Event<A, E>): Event<A, E>`
- [ ] `bufferTime<A, E>(duration: Duration, event: Event<A, E>): Event<A[], E>`
- [ ] `bufferCount<A, E>(count: number, event: Event<A, E>): Event<A[], E>`

### Iteration 5.3: Integration with AsyncIterator protocol

- [ ] `toAsyncIterator<A, E>(event: Event<A, E>): AsyncIterableIterator<A>`
  - Backpressure via the pull-based nature of async iteration
- [ ] `fromAsyncIterator<A>(iter: AsyncIterable<A>): Event<A, never>`
- [ ] Test: `for await (const value of toAsyncIterator(event))` correctly applies backpressure

**Exit criteria:** Async boundaries have backpressure. Synchronous paths are unaffected (zero overhead when not using async features).

---

## Phase 6: API Surface and Developer Experience

**Goal:** Make the library pleasant to use.

### Iteration 6.1: Pipeable utility

- [ ] Implement `pipe(source, op1, op2, ...)` utility with correct type inference up to 12 operators
- [ ] Each combinator has a data-last curried overload for use in `pipe`:
  ```typescript
  // Direct
  map(f, event)
  // Pipeable
  pipe(event, map(f), filter(p), take(10))
  ```

### Iteration 6.2: Fluent API wrapper (optional, separate entry point)

- [ ] Implement `fluent(event: Event<A, E>)` that returns a chainable wrapper
- [ ] Wrapper methods delegate to standalone functions — zero logic duplication
- [ ] Verify tree-shaking: importing only standalone functions doesn't pull in fluent wrapper

### Iteration 6.3: DOM package (`packages/dom`)

- [ ] `fromDOMEvent<K extends keyof HTMLElementEventMap>(type: K, target: EventTarget, options?: AddEventListenerOptions): Event<HTMLElementEventMap[K], never>`
- [ ] `animationFrames: Event<DOMHighResTimeStamp, never>` — emits on each rAF
- [ ] `mousePosition: Behavior<{ x: number, y: number }, never>` — continuous mouse position as a Behavior (updated push-style from mousemove, sampled pull-style)
- [ ] `windowSize: Behavior<{ width: number, height: number }, never>` — continuous window dimensions

### Iteration 6.4: Adapter package (`packages/adapter`)

- [ ] Implement `createAdapter<A, E>(): [push: (value: A) => void, event: Event<A, E>]`
  - Imperative push interface for bridging from callback-based APIs
- [ ] This is the equivalent of RxJS's Subject, but as a separated push/pull pair

### Iteration 6.5: DevTools package (`packages/devtools`)

- [ ] `inspect(event: Event<A, E>): StreamGraph` — returns the operator chain as a serializable tree
- [ ] `label(name: string, event: Event<A, E>): Event<A, E>` — attaches a debug name
- [ ] `trace(event: Event<A, E>): Event<A, E>` — logs every event/error/end with timestamps to console
- [ ] All devtools code is tree-shakeable and eliminated in production builds via `__DEV__` guards

### Iteration 6.6: Documentation

- [ ] Write `docs/semantics.md`: formal denotational semantics for Event and Behavior
  - Event: `⟦Event<A, E>⟧ = [(Time, A)] ∪ Error(E)`
  - Behavior: `⟦Behavior<A, E>⟧ = Time → A`
  - Each combinator's meaning stated as an equation on denotations
- [ ] Write `docs/getting-started.md`: installation, first stream, first behavior, first sample
- [ ] Write `docs/migration-from-rxjs.md`: side-by-side operator comparison
- [ ] Write `docs/migration-from-most.md`: side-by-side comparison
- [ ] Write API reference (auto-generated from JSDoc via typedoc)

**Exit criteria:** A developer can install the library, build a working app with Events and Behaviors, and understand the semantics from the docs.

---

## Phase 7: Hardening and Release

### Iteration 7.1: Property-based test suite completion

- [ ] Every combinator has property-based tests verifying its denotational law
- [ ] Behavior-Event bridge laws:
  - `sample(stepper(a, e), s)` emits the latest value from e (or a) at each s occurrence
  - `sample(constant(x), s) ≡ map(() => x, s)`
  - `sample(mapB(f, b), s) ≡ map(f, sample(b, s))`
- [ ] Error channel laws:
  - `catchError(h, throwError(e)) ≡ h(e)`
  - `catchError(h, map(f, s))` preserves the error type transformation

### Iteration 7.2: Edge case and resource safety tests

- [ ] Disposal: verify that disposing a stream removes DOM listeners, clears timers, etc.
- [ ] Re-entrance: verify behavior when a combinator synchronously triggers another event during event propagation
- [ ] Error during disposal: verify errors in dispose don't leak
- [ ] Memory leak tests: subscribe and unsubscribe 100k times, verify heap returns to baseline

### Iteration 7.3: Bundle size audit

- [ ] Measure gzipped size of `packages/core` with all operators imported
- [ ] Measure gzipped size of minimal import (just `map`, `filter`, `fromArray`, `reduce`)
- [ ] Target: < 4KB gzipped for minimal import, < 8KB for full core
- [ ] If over target: identify heavy modules, split or lazy-load

### Iteration 7.4: Final benchmark run and publish

- [ ] Run full benchmark suite, generate report
- [ ] Publish packages to npm under `@pulse/` scope (or chosen name)
- [ ] Tag v0.1.0

**Exit criteria:** All tests pass. Bundle size within targets. Benchmarks documented. Published to npm.

---

## Appendix: Key Design Decisions to Enforce Throughout

1. **Denotational semantics first.** Every combinator must have a stated meaning as a mathematical function. The implementation is free to differ for performance, but must be observationally equivalent.

2. **Typed errors are not optional.** The `E` parameter flows through every combinator. `E = never` means the stream provably cannot fail.

3. **Behaviors are not just "streams that remember."** They are continuous functions of time. The implementation may cache, but the abstraction is `Time → A`.

4. **Push for events, pull for behaviors.** Events propagate synchronously via direct method calls (Most.js architecture). Behaviors are evaluated lazily when sampled. The bridge between them (stepper, sample) is where push meets pull.

5. **V8 hidden class discipline.** Every class initializes all fields in the constructor. No conditional property addition. No `delete`. This is enforced by code review and lint rules where possible.

6. **Fusion is transparent.** Users never see the IR or fused Sinks. The optimization is purely internal and must be observationally equivalent to the unfused version (verified by tests running both paths).
