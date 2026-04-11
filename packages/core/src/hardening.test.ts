/**
 * Hardening tests: disposal safety, re-entrance, edge cases,
 * memory-leak prevention, and combinator composition stress tests.
 */

import { VirtualScheduler } from "@pulse/scheduler";
import { type Behavior, type Event, type Sink, type Time, toDuration, toTime } from "@pulse/types";
import { describe, expect, it } from "vitest";
import { createAdapter } from "./adapter.js";
import { toAsyncIterator } from "./asyncIterator.js";
import { constantB, readBehavior, sample, snapshot, stepper, switcher } from "./behavior.js";
import { chain } from "./combinators/chain.js";
import { combine, zip } from "./combinators/combine.js";
import { catchError, mapError, throwError } from "./combinators/error.js";
import { filter } from "./combinators/filter.js";
import { map } from "./combinators/map.js";
import { merge } from "./combinators/merge.js";
import { mergeMapConcurrently } from "./combinators/mergeMap.js";
import { scan } from "./combinators/scan.js";
import { skip, take, takeWhile } from "./combinators/slice.js";
import { switchLatest } from "./combinators/switch.js";
import { tap } from "./combinators/tap.js";
import { drain, observe, reduce } from "./combinators/terminal.js";
import { bufferCount, debounce, delay, throttle } from "./combinators/time.js";
import { empty, fromArray, never, now } from "./constructors.js";
import { _createEvent, _getSource } from "./internal/event.js";
import { TestScheduler } from "./internal/testScheduler.js";
import { multicast } from "./multicast.js";

// --- Helpers ---

function collectSync<A>(
  event: Parameters<typeof _getSource>[0],
  scheduler: TestScheduler | VirtualScheduler,
): A[] {
  const values: A[] = [];
  _getSource(event).run(
    {
      event(_t: Time, v: unknown) {
        values.push(v as A);
      },
      error() {},
      end() {},
    } as Sink<unknown, never>,
    scheduler,
  );
  return values;
}

function collectWithEnd<A>(
  event: Parameters<typeof _getSource>[0],
  scheduler: TestScheduler | VirtualScheduler,
): { values: A[]; ended: boolean } {
  const values: A[] = [];
  let ended = false;
  _getSource(event).run(
    {
      event(_t: Time, v: unknown) {
        values.push(v as A);
      },
      error() {},
      end() {
        ended = true;
      },
    } as Sink<unknown, never>,
    scheduler,
  );
  return { values, ended };
}

// ====================================================================
// Disposal safety
// ====================================================================

describe("disposal safety", () => {
  it("dispose mid-stream stops further events (map)", () => {
    const scheduler = new TestScheduler();
    const [push, event] = createAdapter<number>();
    const mapped = map((x: number) => x * 2, event);
    const values: number[] = [];

    const d = _getSource(mapped).run(
      {
        event(_t: Time, v: number) {
          values.push(v);
        },
        error() {},
        end() {},
      },
      scheduler,
    );

    push(1);
    push(2);
    d.dispose();
    push(3);
    push(4);
    expect(values).toEqual([2, 4]);
  });

  it("dispose mid-stream stops further events (filter)", () => {
    const scheduler = new TestScheduler();
    const [push, event] = createAdapter<number>();
    const filtered = filter((x: number) => x > 0, event);
    const values: number[] = [];

    const d = _getSource(filtered).run(
      {
        event(_t: Time, v: number) {
          values.push(v);
        },
        error() {},
        end() {},
      },
      scheduler,
    );

    push(1);
    push(2);
    d.dispose();
    push(3);
    expect(values).toEqual([1, 2]);
  });

  it("double dispose is safe (no throw)", () => {
    const scheduler = new TestScheduler();
    const d = _getSource(fromArray([1, 2, 3])).run({ event() {}, error() {}, end() {} }, scheduler);
    d.dispose();
    d.dispose(); // should not throw
  });

  it("take disposes source after n values", () => {
    let disposed = false;
    const source = _createEvent<number, never>({
      run(sink, scheduler) {
        sink.event(scheduler.currentTime(), 1);
        sink.event(scheduler.currentTime(), 2);
        sink.event(scheduler.currentTime(), 3);
        sink.end(scheduler.currentTime());
        return {
          dispose() {
            disposed = true;
          },
        };
      },
    });

    const scheduler = new TestScheduler();
    const result = collectSync<number>(take(2, source), scheduler);
    expect(result).toEqual([1, 2]);
    expect(disposed).toBe(true);
  });

  it("takeWhile disposes source when predicate fails", () => {
    let disposed = false;
    const source = _createEvent<number, never>({
      run(sink, scheduler) {
        sink.event(scheduler.currentTime(), 1);
        sink.event(scheduler.currentTime(), 2);
        sink.event(scheduler.currentTime(), 10);
        sink.event(scheduler.currentTime(), 3);
        sink.end(scheduler.currentTime());
        return {
          dispose() {
            disposed = true;
          },
        };
      },
    });

    const scheduler = new TestScheduler();
    const result = collectSync<number>(
      takeWhile((x: number) => x < 5, source),
      scheduler,
    );
    expect(result).toEqual([1, 2]);
    expect(disposed).toBe(true);
  });

  it("switchLatest disposes previous inner on new outer event", () => {
    const scheduler = new TestScheduler();
    const disposed: string[] = [];

    const inner1 = _createEvent<number, never>({
      run(sink, sched) {
        sink.event(sched.currentTime(), 1);
        return {
          dispose() {
            disposed.push("inner1");
          },
        };
      },
    });

    const inner2 = _createEvent<number, never>({
      run(sink, sched) {
        sink.event(sched.currentTime(), 2);
        sink.end(sched.currentTime());
        return {
          dispose() {
            disposed.push("inner2");
          },
        };
      },
    });

    let pushOuter: ((t: Time, v: Parameters<typeof _getSource>[0]) => void) | undefined;
    let endOuter: ((t: Time) => void) | undefined;
    const outer = _createEvent<Parameters<typeof _getSource>[0], never>({
      run(sink) {
        pushOuter = (t, v) => sink.event(t, v);
        endOuter = (t) => sink.end(t);
        return { dispose() {} };
      },
    });

    const values: number[] = [];
    _getSource(switchLatest(outer as Parameters<typeof switchLatest>[0])).run(
      {
        event(_t: Time, v: number) {
          values.push(v);
        },
        error() {},
        end() {},
      },
      scheduler,
    );

    pushOuter?.(toTime(0), inner1);
    expect(values).toEqual([1]);

    pushOuter?.(toTime(1), inner2);
    expect(disposed).toContain("inner1");
    expect(values).toEqual([1, 2]);

    endOuter?.(toTime(2));
  });

  it("chain disposes inner on outer dispose", () => {
    const scheduler = new TestScheduler();
    let innerDisposed = false;

    const inner = _createEvent<number, never>({
      run(sink, sched) {
        sink.event(sched.currentTime(), 42);
        return {
          dispose() {
            innerDisposed = true;
          },
        };
      },
    });

    const chained = chain(() => inner, now(1));
    const d = _getSource(chained).run({ event() {}, error() {}, end() {} }, scheduler);

    d.dispose();
    expect(innerDisposed).toBe(true);
  });

  it("mergeMapConcurrently disposes all inner streams on dispose", () => {
    const scheduler = new TestScheduler();
    const disposed: number[] = [];

    const result = mergeMapConcurrently(
      (x: number) =>
        _createEvent<number, never>({
          run(sink, sched) {
            sink.event(sched.currentTime(), x * 10);
            return {
              dispose() {
                disposed.push(x);
              },
            };
          },
        }),
      Number.POSITIVE_INFINITY,
      fromArray([1, 2, 3]),
    );

    const d = _getSource(result).run({ event() {}, error() {}, end() {} }, scheduler);

    d.dispose();
    expect(disposed).toEqual([1, 2, 3]);
  });

  it("delay disposes pending scheduled tasks on early dispose", () => {
    const scheduler = new VirtualScheduler();

    let push: ((t: Time, v: number) => void) | undefined;
    const event = _createEvent<number, never>({
      run(sink) {
        push = (t, v) => sink.event(t, v);
        return { dispose() {} };
      },
    });

    const delayed = delay(toDuration(100), event);
    const values: number[] = [];
    const d = _getSource(delayed).run(
      {
        event(_t: Time, v: number) {
          values.push(v);
        },
        error() {},
        end() {},
      },
      scheduler,
    );

    push?.(toTime(0), 1);
    push?.(toTime(10), 2);

    // Dispose before the delay fires
    d.dispose();
    scheduler.advanceTo(toTime(200));

    // No values should have arrived
    expect(values).toEqual([]);
  });

  it("debounce disposes pending timer on dispose", () => {
    const scheduler = new VirtualScheduler();

    let push: ((t: Time, v: number) => void) | undefined;
    const event = _createEvent<number, never>({
      run(sink) {
        push = (t, v) => sink.event(t, v);
        return { dispose() {} };
      },
    });

    const debounced = debounce(toDuration(50), event);
    const values: number[] = [];
    const d = _getSource(debounced).run(
      {
        event(_t: Time, v: number) {
          values.push(v);
        },
        error() {},
        end() {},
      },
      scheduler,
    );

    push?.(toTime(0), 1);
    d.dispose();

    scheduler.advanceTo(toTime(100));
    expect(values).toEqual([]);
  });

  it("multicast disposes source after all subscribers leave", () => {
    let disposed = false;
    const source = _createEvent<number, never>({
      run() {
        return {
          dispose() {
            disposed = true;
          },
        };
      },
    });

    const shared = multicast(source);
    const scheduler = new TestScheduler();

    const d1 = _getSource(shared).run({ event() {}, error() {}, end() {} }, scheduler);
    const d2 = _getSource(shared).run({ event() {}, error() {}, end() {} }, scheduler);
    const d3 = _getSource(shared).run({ event() {}, error() {}, end() {} }, scheduler);

    d1.dispose();
    expect(disposed).toBe(false);
    d2.dispose();
    expect(disposed).toBe(false);
    d3.dispose();
    expect(disposed).toBe(true);
  });

  it("stepper disposes when dispose is called", () => {
    const scheduler = new VirtualScheduler();

    let push: ((t: Time, v: number) => void) | undefined;
    const event = _createEvent<number, never>({
      run(sink) {
        push = (t, v) => sink.event(t, v);
        return {
          dispose() {
            push = undefined;
          },
        };
      },
    });

    const [b, d] = stepper(0, event, scheduler);

    push?.(toTime(10), 5);
    expect(readBehavior(b, toTime(10))).toBe(5);

    d.dispose();

    // After dispose, the source is disconnected so push is undefined
    expect(push).toBeUndefined();
    // Stepper retains last value
    expect(readBehavior(b, toTime(20))).toBe(5);
  });
});

// ====================================================================
// Re-entrance safety
// ====================================================================

describe("re-entrance safety", () => {
  it("push inside a sink callback (adapter)", () => {
    const scheduler = new TestScheduler();
    const [push, event] = createAdapter<number>();
    const values: number[] = [];

    _getSource(event).run(
      {
        event(_t: Time, v: number) {
          values.push(v);
          // Re-entrant push
          if (v === 1) push(2);
        },
        error() {},
        end() {},
      },
      scheduler,
    );

    push(1);
    expect(values).toContain(1);
    expect(values).toContain(2);
  });

  it("map inside tap callback (re-entrant)", () => {
    const scheduler = new TestScheduler();
    const [push, event] = createAdapter<number>();
    const sideEffects: number[] = [];
    const values: number[] = [];

    const tapped = tap((x: number) => {
      sideEffects.push(x);
      if (x === 1) push(2);
    }, event);

    const mapped = map((x: number) => x * 10, tapped);

    _getSource(mapped).run(
      {
        event(_t: Time, v: number) {
          values.push(v);
        },
        error() {},
        end() {},
      },
      scheduler,
    );

    push(1);
    expect(values).toContain(10);
    expect(values).toContain(20);
  });

  it("scan handles re-entrant push correctly", () => {
    const scheduler = new TestScheduler();
    const [push, event] = createAdapter<number>();
    const values: number[] = [];
    let pushed = false;

    const scanned = scan((acc: number, x: number) => acc + x, 0, event);

    _getSource(scanned).run(
      {
        event(_t: Time, v: number) {
          values.push(v);
          if (!pushed && v === 1) {
            pushed = true;
            push(2);
          }
        },
        error() {},
        end() {},
      },
      scheduler,
    );

    push(1);
    expect(values).toEqual([1, 3]); // 0+1=1, 1+2=3
  });
});

// ====================================================================
// Edge cases
// ====================================================================

describe("edge cases", () => {
  it("empty stream ends immediately", () => {
    const scheduler = new TestScheduler();
    const { values, ended } = collectWithEnd<number>(empty(), scheduler);
    expect(values).toEqual([]);
    expect(ended).toBe(true);
  });

  it("never stream does not end", () => {
    const scheduler = new TestScheduler();
    const { values, ended } = collectWithEnd<number>(never(), scheduler);
    expect(values).toEqual([]);
    expect(ended).toBe(false);
  });

  it("now emits exactly one value", () => {
    const scheduler = new TestScheduler();
    const { values, ended } = collectWithEnd<number>(now(42), scheduler);
    expect(values).toEqual([42]);
    expect(ended).toBe(true);
  });

  it("fromArray([]) behaves like empty", () => {
    const scheduler = new TestScheduler();
    const { values, ended } = collectWithEnd<number>(fromArray([]), scheduler);
    expect(values).toEqual([]);
    expect(ended).toBe(true);
  });

  it("fromArray with single element", () => {
    const scheduler = new TestScheduler();
    const result = collectSync<number>(fromArray([99]), scheduler);
    expect(result).toEqual([99]);
  });

  it("map on empty produces empty", () => {
    const scheduler = new TestScheduler();
    const { values, ended } = collectWithEnd<number>(
      map((x: number) => x * 2, empty()),
      scheduler,
    );
    expect(values).toEqual([]);
    expect(ended).toBe(true);
  });

  it("filter that rejects all produces empty (still ends)", () => {
    const scheduler = new TestScheduler();
    const { values, ended } = collectWithEnd<number>(
      filter(() => false, fromArray([1, 2, 3])),
      scheduler,
    );
    expect(values).toEqual([]);
    expect(ended).toBe(true);
  });

  it("take(1) on now(x) returns x", () => {
    const scheduler = new TestScheduler();
    const result = collectSync<number>(take(1, now(42)), scheduler);
    expect(result).toEqual([42]);
  });

  it("skip on empty produces empty", () => {
    const scheduler = new TestScheduler();
    const { values, ended } = collectWithEnd<number>(skip(5, empty()), scheduler);
    expect(values).toEqual([]);
    expect(ended).toBe(true);
  });

  it("merge of a single empty ends", () => {
    const scheduler = new TestScheduler();
    const { values, ended } = collectWithEnd<number>(merge(empty<number>()), scheduler);
    expect(values).toEqual([]);
    expect(ended).toBe(true);
  });

  it("combine where one side never emits yields nothing", () => {
    const scheduler = new TestScheduler();
    const result = collectSync<number>(
      combine((a: number, b: number) => a + b, fromArray([1, 2]), never()),
      scheduler,
    );
    // b never has a value, so combine never emits
    expect(result).toEqual([]);
  });

  it("zip with empty produces empty", () => {
    const scheduler = new TestScheduler();
    const result = collectSync<[number, string]>(zip(fromArray([1, 2]), empty()), scheduler);
    expect(result).toEqual([]);
  });

  it("chain on empty produces empty", () => {
    const scheduler = new TestScheduler();
    const { values, ended } = collectWithEnd<number>(
      chain((x: number) => fromArray([x, x + 1]), empty()),
      scheduler,
    );
    expect(values).toEqual([]);
    expect(ended).toBe(true);
  });

  it("chain where inner is always empty", () => {
    const scheduler = new TestScheduler();
    const result = collectSync<number>(
      chain(() => empty<number>(), fromArray([1, 2, 3])),
      scheduler,
    );
    expect(result).toEqual([]);
  });

  it("scan on empty produces empty", () => {
    const scheduler = new TestScheduler();
    const result = collectSync<number>(
      scan((acc: number, x: number) => acc + x, 0, empty()),
      scheduler,
    );
    expect(result).toEqual([]);
  });

  it("reduce on empty returns seed", async () => {
    const scheduler = new TestScheduler();
    const result = await reduce((acc: number, x: number) => acc + x, 42, empty(), scheduler);
    expect(result).toBe(42);
  });

  it("observe on empty resolves immediately", async () => {
    const scheduler = new TestScheduler();
    const seen: number[] = [];
    await observe((x: number) => seen.push(x), empty(), scheduler);
    expect(seen).toEqual([]);
  });

  it("drain on empty resolves", async () => {
    const scheduler = new TestScheduler();
    await drain(empty(), scheduler);
  });

  it("bufferCount(1) emits each value individually", () => {
    const scheduler = new TestScheduler();
    const result = collectSync<number[]>(bufferCount(1, fromArray([1, 2, 3])), scheduler);
    expect(result).toEqual([[1], [2], [3]]);
  });

  it("bufferCount on empty produces empty", () => {
    const scheduler = new TestScheduler();
    const result = collectSync<number[]>(bufferCount(5, empty()), scheduler);
    expect(result).toEqual([]);
  });
});

// ====================================================================
// Error propagation
// ====================================================================

describe("error propagation through combinators", () => {
  it("map propagates errors", () => {
    const scheduler = new TestScheduler();
    const errors: string[] = [];
    const mapped = map((x: number) => x * 2, throwError<number, string>("oops"));

    _getSource(mapped).run(
      {
        event() {},
        error(_t: Time, err: string) {
          errors.push(err);
        },
        end() {},
      },
      scheduler,
    );

    expect(errors).toEqual(["oops"]);
  });

  it("filter propagates errors", () => {
    const scheduler = new TestScheduler();
    const errors: string[] = [];
    const filtered = filter((x: number) => x > 0, throwError<number, string>("oops"));

    _getSource(filtered).run(
      {
        event() {},
        error(_t: Time, err: string) {
          errors.push(err);
        },
        end() {},
      },
      scheduler,
    );

    expect(errors).toEqual(["oops"]);
  });

  it("scan propagates errors", () => {
    const scheduler = new TestScheduler();
    const errors: string[] = [];

    _getSource(scan((acc: number, x: number) => acc + x, 0, throwError<number, string>("err"))).run(
      {
        event() {},
        error(_t: Time, err: string) {
          errors.push(err);
        },
        end() {},
      },
      scheduler,
    );

    expect(errors).toEqual(["err"]);
  });

  it("merge propagates error from any source", () => {
    const scheduler = new TestScheduler();
    const errors: string[] = [];

    _getSource(merge(fromArray([1, 2]), throwError<number, string>("boom"))).run(
      {
        event() {},
        error(_t: Time, err: string) {
          errors.push(err);
        },
        end() {},
      },
      scheduler,
    );

    expect(errors).toEqual(["boom"]);
  });

  it("combine propagates error from either source", () => {
    const scheduler = new TestScheduler();
    const errors: string[] = [];

    _getSource(
      combine(
        (a: number, b: number) => a + b,
        throwError<number, string>("left-err"),
        fromArray([1]),
      ),
    ).run(
      {
        event() {},
        error(_t: Time, err: string) {
          errors.push(err);
        },
        end() {},
      },
      scheduler,
    );

    expect(errors).toEqual(["left-err"]);
  });

  it("catchError can recover from map error chain", () => {
    const scheduler = new TestScheduler();

    // Build: throwError -> map -> catchError
    const source = map((x: number) => x * 2, throwError<number, string>("fail"));
    const recovered = catchError((err: string) => fromArray([err.length * 100]), source);

    const result = collectSync<number>(recovered, scheduler);
    expect(result).toEqual([400]); // "fail".length = 4, * 100 = 400
  });

  it("mapError composes: mapError(g, mapError(f, e)) transforms through both", () => {
    const scheduler = new TestScheduler();
    const errors: number[] = [];

    const source = throwError<number, string>("hi");
    const mapped = mapError(
      (n: number) => n * 10,
      mapError((s: string) => s.length, source),
    );

    _getSource(mapped).run(
      {
        event() {},
        error(_t: Time, err: number) {
          errors.push(err);
        },
        end() {},
      },
      scheduler,
    );

    expect(errors).toEqual([20]); // "hi".length = 2, * 10 = 20
  });

  it("multicast broadcasts errors to all subscribers", () => {
    const scheduler = new TestScheduler();
    const [push, event] = createAdapter<number>();
    const shared = multicast(event);

    const errorsA: string[] = [];
    const errorsB: string[] = [];

    let pushErr: ((t: Time, err: string) => void) | undefined;
    const errEvent = _createEvent<number, string>({
      run(sink) {
        pushErr = (t, e) => sink.error(t, e);
        return { dispose() {} };
      },
    });

    const sharedErr = multicast(errEvent);

    _getSource(sharedErr).run(
      {
        event() {},
        error(_t: Time, err: string) {
          errorsA.push(err);
        },
        end() {},
      },
      scheduler,
    );
    _getSource(sharedErr).run(
      {
        event() {},
        error(_t: Time, err: string) {
          errorsB.push(err);
        },
        end() {},
      },
      scheduler,
    );

    pushErr?.(toTime(0), "boom");
    expect(errorsA).toEqual(["boom"]);
    expect(errorsB).toEqual(["boom"]);
  });
});

// ====================================================================
// Multicast edge cases
// ====================================================================

describe("multicast edge cases", () => {
  it("new subscriber after source ended gets end immediately", () => {
    const scheduler = new TestScheduler();
    const shared = multicast(fromArray([1, 2, 3]));

    // First subscriber triggers source, which completes synchronously
    const values1: number[] = [];
    _getSource(shared).run(
      {
        event(_t: Time, v: number) {
          values1.push(v);
        },
        error() {},
        end() {},
      },
      scheduler,
    );
    expect(values1).toEqual([1, 2, 3]);

    // Late subscriber should get end immediately
    let lateEnded = false;
    const lateValues: number[] = [];
    _getSource(shared).run(
      {
        event(_t: Time, v: number) {
          lateValues.push(v);
        },
        error() {},
        end() {
          lateEnded = true;
        },
      },
      scheduler,
    );
    expect(lateValues).toEqual([]);
    expect(lateEnded).toBe(true);
  });

  it("multicast idempotent: multicast(multicast(e)) is same as multicast(e)", () => {
    const scheduler = new TestScheduler();
    let subscriptions = 0;
    const source = _createEvent<number, never>({
      run(sink, sched) {
        subscriptions++;
        sink.event(sched.currentTime(), 1);
        sink.end(sched.currentTime());
        return { dispose() {} };
      },
    });

    const once = multicast(source);
    const twice = multicast(once);

    const vals: number[] = [];
    _getSource(twice).run(
      {
        event(_t: Time, v: number) {
          vals.push(v);
        },
        error() {},
        end() {},
      },
      scheduler,
    );

    expect(vals).toEqual([1]);
    expect(subscriptions).toBe(1);
  });
});

// ====================================================================
// Behavior edge cases
// ====================================================================

describe("behavior edge cases", () => {
  it("sample of constant with empty sampler produces empty", () => {
    const scheduler = new VirtualScheduler();
    const b = constantB(42);

    const values: number[] = [];
    let ended = false;
    _getSource(sample(b, empty())).run(
      {
        event(_t: Time, v: number) {
          values.push(v);
        },
        error() {},
        end() {
          ended = true;
        },
      },
      scheduler,
    );

    expect(values).toEqual([]);
    expect(ended).toBe(true);
  });

  it("snapshot with empty event produces empty", () => {
    const scheduler = new VirtualScheduler();
    const b = constantB(10);

    const values: number[] = [];
    _getSource(snapshot((bv: number, ev: number) => bv + ev, b, empty())).run(
      {
        event(_t: Time, v: number) {
          values.push(v);
        },
        error() {},
        end() {},
      },
      scheduler,
    );

    expect(values).toEqual([]);
  });

  it("stepper retains value after source ends", () => {
    const scheduler = new VirtualScheduler();
    const event = fromArray([1, 2, 3]);

    const [b, d] = stepper(0, event, scheduler);
    // Source already ended synchronously after emitting 1,2,3
    expect(readBehavior(b, toTime(0))).toBe(3);
    d.dispose();
  });

  it("switcher retains current behavior after switch event source ends", () => {
    const scheduler = new VirtualScheduler();

    let pushSwitch: ((t: Time, b: Behavior<number, never>) => void) | undefined;
    const switchEvent = _createEvent<Behavior<number, never>, never>({
      run(sink) {
        pushSwitch = (t, v) => sink.event(t, v);
        return { dispose() {} };
      },
    });

    const [b, d] = switcher(constantB(1), switchEvent, scheduler);
    expect(readBehavior(b, toTime(0))).toBe(1);

    pushSwitch?.(toTime(10), constantB(99));
    expect(readBehavior(b, toTime(10))).toBe(99);

    // After switch, the new behavior should persist
    expect(readBehavior(b, toTime(100))).toBe(99);

    d.dispose();
  });
});

// ====================================================================
// Deep pipeline composition
// ====================================================================

describe("deep pipeline composition", () => {
  it("10-deep map chain produces correct result", () => {
    const scheduler = new TestScheduler();
    let event: Event<number, never> = fromArray([1]);
    for (let i = 0; i < 10; i++) {
      event = map((x: number) => x + 1, event);
    }
    const result = collectSync<number>(event, scheduler);
    expect(result).toEqual([11]); // 1 + 10 increments
  });

  it("deep filter chain works", () => {
    const scheduler = new TestScheduler();
    const source = fromArray(Array.from({ length: 100 }, (_, i) => i));

    // Stack 5 filters that each check x > threshold
    let event: Event<number, never> = source;
    for (let threshold = 0; threshold < 50; threshold += 10) {
      const t = threshold;
      event = filter((x: number) => x > t, event);
    }

    const result = collectSync<number>(event, scheduler);
    // All values > 40
    const expected = Array.from({ length: 100 }, (_, i) => i).filter((x) => x > 40);
    expect(result).toEqual(expected);
  });

  it("map -> filter -> scan -> take pipeline", () => {
    const scheduler = new TestScheduler();
    const source = fromArray(Array.from({ length: 100 }, (_, i) => i));

    const pipeline = take(
      5,
      scan(
        (acc: number, x: number) => acc + x,
        0,
        filter(
          (x: number) => x % 2 === 0,
          map((x: number) => x + 1, source),
        ),
      ),
    );

    const result = collectSync<number>(pipeline, scheduler);
    // source:  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, ...
    // +1:      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, ...
    // even:    2, 4, 6, 8, 10, ...
    // scan:    2, 6, 12, 20, 30
    // take(5): 2, 6, 12, 20, 30
    expect(result).toEqual([2, 6, 12, 20, 30]);
  });

  it("merge -> map -> reduce pipeline", async () => {
    const scheduler = new TestScheduler();
    const a = fromArray([1, 2, 3]);
    const b = fromArray([4, 5, 6]);

    const result = await reduce(
      (acc: number, x: number) => acc + x,
      0,
      map((x: number) => x * 2, merge(a, b)),
      scheduler,
    );

    // merged: 1,2,3,4,5,6 -> *2 -> 2,4,6,8,10,12 -> sum = 42
    expect(result).toBe(42);
  });

  it("chain -> map -> take pipeline", () => {
    const scheduler = new TestScheduler();

    const pipeline = take(
      6,
      map(
        (x: number) => x * 100,
        chain((x: number) => fromArray([x, x + 1]), fromArray([1, 2, 3, 4, 5])),
      ),
    );

    const result = collectSync<number>(pipeline, scheduler);
    // chain: 1,2, 2,3, 3,4, 4,5, 5,6
    // *100:  100,200, 200,300, 300,400, ...
    // take(6): 100, 200, 200, 300, 300, 400
    expect(result).toEqual([100, 200, 200, 300, 300, 400]);
  });

  it("switchLatest with empty inners ends correctly", () => {
    const scheduler = new TestScheduler();
    const outer = fromArray([empty<number>(), empty<number>(), fromArray([42])]);
    const result = collectSync<number>(switchLatest(outer), scheduler);
    expect(result).toEqual([42]);
  });
});

// ====================================================================
// mergeMapConcurrently edge cases
// ====================================================================

describe("mergeMapConcurrently edge cases", () => {
  it("concurrency=1 behaves like concatMap", () => {
    const scheduler = new TestScheduler();
    const result = collectSync<number>(
      mergeMapConcurrently((x: number) => fromArray([x * 10, x * 10 + 1]), 1, fromArray([1, 2, 3])),
      scheduler,
    );
    expect(result).toEqual([10, 11, 20, 21, 30, 31]);
  });

  it("concurrency=Infinity runs all at once", () => {
    const scheduler = new TestScheduler();
    const result = collectSync<number>(
      mergeMapConcurrently(
        (x: number) => fromArray([x * 10]),
        Number.POSITIVE_INFINITY,
        fromArray([1, 2, 3]),
      ),
      scheduler,
    );
    expect(result).toEqual([10, 20, 30]);
  });

  it("empty outer ends immediately", () => {
    const scheduler = new TestScheduler();
    const { values, ended } = collectWithEnd<number>(
      mergeMapConcurrently((x: number) => fromArray([x]), 2, empty()),
      scheduler,
    );
    expect(values).toEqual([]);
    expect(ended).toBe(true);
  });

  it("inner streams that are empty complete correctly", () => {
    const scheduler = new TestScheduler();
    const result = collectSync<number>(
      mergeMapConcurrently(() => empty<number>(), 2, fromArray([1, 2, 3])),
      scheduler,
    );
    expect(result).toEqual([]);
  });
});

// ====================================================================
// AsyncIterator edge cases
// ====================================================================

describe("toAsyncIterator edge cases", () => {
  it("iterating an empty event produces done immediately", async () => {
    const scheduler = new TestScheduler();
    const iter = toAsyncIterator(empty(), scheduler);
    const result = await iter.next();
    expect(result.done).toBe(true);
  });

  it("iterating now(x) produces one value then done", async () => {
    const scheduler = new TestScheduler();
    const iter = toAsyncIterator(now(42), scheduler);

    const r1 = await iter.next();
    expect(r1).toEqual({ value: 42, done: false });

    const r2 = await iter.next();
    expect(r2.done).toBe(true);
  });

  it("dispose stops iteration", async () => {
    const scheduler = new TestScheduler();
    const [push, event] = createAdapter<number>();
    const iter = toAsyncIterator(event, scheduler);

    // Push a value, consume it
    push(1);
    const r1 = await iter.next();
    expect(r1).toEqual({ value: 1, done: false });

    // Dispose before any more values
    iter.dispose();

    const r = await iter.next();
    expect(r.done).toBe(true);
  });

  it("for-await-of works correctly", async () => {
    const scheduler = new TestScheduler();
    const iter = toAsyncIterator(fromArray([10, 20, 30]), scheduler);

    const values: number[] = [];
    for await (const v of iter) {
      values.push(v);
    }
    expect(values).toEqual([10, 20, 30]);
  });
});

// ====================================================================
// Zip edge cases
// ====================================================================

describe("zip edge cases", () => {
  it("zip with unequal lengths truncates to shorter", () => {
    const scheduler = new TestScheduler();
    const result = collectSync<[number, number]>(
      zip(fromArray([1, 2, 3, 4, 5]), fromArray([10, 20])),
      scheduler,
    );
    expect(result).toEqual([
      [1, 10],
      [2, 20],
    ]);
  });

  it("zip with empty produces empty", () => {
    const scheduler = new TestScheduler();
    const result = collectSync<[number, number]>(zip(empty(), fromArray([1, 2])), scheduler);
    expect(result).toEqual([]);
  });

  it("zip with itself pairs up sequential values", () => {
    const scheduler = new TestScheduler();
    const s = fromArray([1, 2, 3]);
    const result = collectSync<[number, number]>(zip(s, s), scheduler);
    // Both sides run independently from the same source spec
    expect(result).toEqual([
      [1, 1],
      [2, 2],
      [3, 3],
    ]);
  });
});

// ====================================================================
// Throttle/Debounce edge cases
// ====================================================================

describe("throttle edge cases", () => {
  it("throttle with zero duration passes all values", () => {
    const scheduler = new VirtualScheduler();

    let push: ((t: Time, v: number) => void) | undefined;
    const event = _createEvent<number, never>({
      run(sink) {
        push = (t, v) => sink.event(t, v);
        return { dispose() {} };
      },
    });

    const throttled = throttle(toDuration(0), event);
    const values: number[] = [];
    _getSource(throttled).run(
      {
        event(_t: Time, v: number) {
          values.push(v);
        },
        error() {},
        end() {},
      },
      scheduler,
    );

    push?.(toTime(0), 1);
    push?.(toTime(0), 2);
    push?.(toTime(0), 3);
    expect(values).toEqual([1, 2, 3]);
  });
});

describe("debounce edge cases", () => {
  it("debounce flushes final value on end", () => {
    const scheduler = new VirtualScheduler();

    let push: ((t: Time, v: number) => void) | undefined;
    let endStream: ((t: Time) => void) | undefined;
    const event = _createEvent<number, never>({
      run(sink) {
        push = (t, v) => sink.event(t, v);
        endStream = (t) => sink.end(t);
        return { dispose() {} };
      },
    });

    const debounced = debounce(toDuration(100), event);
    const values: number[] = [];
    let ended = false;
    _getSource(debounced).run(
      {
        event(_t: Time, v: number) {
          values.push(v);
        },
        error() {},
        end() {
          ended = true;
        },
      },
      scheduler,
    );

    push?.(toTime(0), 1);
    push?.(toTime(10), 2);
    push?.(toTime(20), 3);

    // End before debounce timer fires — should flush
    endStream?.(toTime(30));
    expect(values).toEqual([3]);
    expect(ended).toBe(true);
  });
});

// ====================================================================
// Adapter with multicast + map pipeline
// ====================================================================

describe("adapter + multicast + map integration", () => {
  it("multiple subscribers to a mapped adapter via multicast", () => {
    const scheduler = new TestScheduler();
    const [push, event] = createAdapter<number>();
    const shared = multicast(map((x: number) => x * 2, event));

    const a: number[] = [];
    const b: number[] = [];

    _getSource(shared).run(
      {
        event(_t: Time, v: number) {
          a.push(v);
        },
        error() {},
        end() {},
      },
      scheduler,
    );
    _getSource(shared).run(
      {
        event(_t: Time, v: number) {
          b.push(v);
        },
        error() {},
        end() {},
      },
      scheduler,
    );

    push(1);
    push(2);
    push(3);

    expect(a).toEqual([2, 4, 6]);
    expect(b).toEqual([2, 4, 6]);
  });
});
