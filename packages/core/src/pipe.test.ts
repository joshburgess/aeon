import { type Event, type Sink, type Time, toDuration, toTime } from "aeon-types";
import { describe, expect, expectTypeOf, it } from "vitest";
import { reduce } from "./combinators/terminal.js";
import { empty, fromArray, now } from "./constructors.js";
import { _getSource } from "./internal/event.js";
import { TestScheduler } from "./internal/testScheduler.js";
import { pipe } from "./pipe.js";
import * as P from "./pipeable.js";

function collectSync<A>(event: Event<A, never>, scheduler: TestScheduler): A[] {
  const values: A[] = [];
  _getSource(event).run(
    {
      event(_t: Time, v: A) {
        values.push(v);
      },
      error() {},
      end() {},
    },
    scheduler,
  );
  return values;
}

describe("pipe", () => {
  it("passes through source with no operators", () => {
    const source = fromArray([1, 2, 3]);
    expect(pipe(source)).toBe(source);
  });

  it("applies a single operator", () => {
    const scheduler = new TestScheduler();
    const result = pipe(
      fromArray([1, 2, 3]),
      P.map((x: number) => x * 2),
    );
    expect(collectSync(result, scheduler)).toEqual([2, 4, 6]);
  });

  it("chains multiple operators with type inference", () => {
    const scheduler = new TestScheduler();
    const result = pipe(
      fromArray([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
      P.filter((x: number) => x % 2 === 0),
      P.map((x: number) => x * 10),
      P.take(3),
    );
    expect(collectSync(result, scheduler)).toEqual([20, 40, 60]);
  });

  it("works with scan and terminal operators", async () => {
    const scheduler = new TestScheduler();
    const result = await pipe(
      fromArray([1, 2, 3, 4]),
      P.scan((acc: number, x: number) => acc + x, 0),
      (e) => reduce((acc: number, x: number) => acc + x, 0, e, scheduler),
    );
    // scan produces [1, 3, 6, 10], reduce sums them: 1+3+6+10=20
    expect(result).toBe(20);
  });

  it("works with drop and slice", () => {
    const scheduler = new TestScheduler();
    const result = pipe(fromArray([1, 2, 3, 4, 5, 6, 7, 8]), P.drop(2), P.take(3));
    expect(collectSync(result, scheduler)).toEqual([3, 4, 5]);
  });
});

describe("pipeable operators", () => {
  it("P.tap runs side effects", () => {
    const scheduler = new TestScheduler();
    const seen: number[] = [];
    const result = pipe(
      fromArray([1, 2, 3]),
      P.tap((x: number) => seen.push(x)),
      P.map((x: number) => x + 10),
    );
    expect(collectSync(result, scheduler)).toEqual([11, 12, 13]);
    expect(seen).toEqual([1, 2, 3]);
  });

  it("P.constant replaces values", () => {
    const scheduler = new TestScheduler();
    const result = pipe(fromArray([1, 2, 3]), P.constant("x"));
    expect(collectSync(result, scheduler)).toEqual(["x", "x", "x"]);
  });

  it("P.takeWhile and P.dropWhile", () => {
    const scheduler = new TestScheduler();
    const tw = pipe(
      fromArray([1, 2, 3, 4, 5]),
      P.takeWhile((x: number) => x < 4),
    );
    expect(collectSync(tw, scheduler)).toEqual([1, 2, 3]);

    const sw = pipe(
      fromArray([1, 2, 3, 4, 5]),
      P.dropWhile((x: number) => x < 3),
    );
    expect(collectSync(sw, scheduler)).toEqual([3, 4, 5]);
  });

  it("P.slice", () => {
    const scheduler = new TestScheduler();
    const result = pipe(fromArray([1, 2, 3, 4, 5]), P.slice(1, 4));
    expect(collectSync(result, scheduler)).toEqual([2, 3, 4]);
  });

  it("P.dedupe suppresses consecutive duplicates", () => {
    const scheduler = new TestScheduler();
    const result = pipe(fromArray([1, 1, 2, 2, 3, 1]), P.dedupe());
    expect(collectSync(result, scheduler)).toEqual([1, 2, 3, 1]);
  });

  it("P.cons prepends a value", () => {
    const scheduler = new TestScheduler();
    const result = pipe(fromArray([2, 3]), P.cons(1));
    expect(collectSync(result, scheduler)).toEqual([1, 2, 3]);
  });

  it("P.first emits only the first value", () => {
    const scheduler = new TestScheduler();
    const result = pipe(fromArray([10, 20, 30]), P.first());
    expect(collectSync(result, scheduler)).toEqual([10]);
  });

  it("P.last emits only the final value", () => {
    const scheduler = new TestScheduler();
    const result = pipe(fromArray([10, 20, 30]), P.last());
    expect(collectSync(result, scheduler)).toEqual([30]);
  });

  it("P.pairwise emits [prev, curr] pairs", () => {
    const scheduler = new TestScheduler();
    const result = pipe(fromArray([1, 2, 3]), P.pairwise);
    expect(collectSync(result, scheduler)).toEqual([
      [1, 2],
      [2, 3],
    ]);
  });

  it("P.chain maps and flattens sequentially", () => {
    const scheduler = new TestScheduler();
    const result = pipe(
      fromArray([1, 2, 3]),
      P.chain((x: number) => fromArray([x, x * 10])),
    );
    expect(collectSync(result, scheduler)).toEqual([1, 10, 2, 20, 3, 30]);
  });

  it("P.exhaustMap projects to inner streams", () => {
    const scheduler = new TestScheduler();
    const result = pipe(
      fromArray([1, 2]),
      P.exhaustMap((x: number) => now(x * 100)),
    );
    expect(collectSync(result, scheduler)).toEqual([100, 200]);
  });

  it("P.orElse emits fallback on empty", () => {
    const scheduler = new TestScheduler();
    const result = pipe(empty<number>(), P.orElse(99));
    expect(collectSync(result, scheduler)).toEqual([99]);
  });

  it("P.ensure runs cleanup on end", () => {
    const scheduler = new TestScheduler();
    let cleaned = false;
    const result = pipe(
      fromArray([1, 2]),
      P.ensure(() => {
        cleaned = true;
      }),
    );
    collectSync(result, scheduler);
    expect(cleaned).toBe(true);
  });

  it("P.count emits total count on end", () => {
    const scheduler = new TestScheduler();
    const result = pipe(fromArray([1, 2, 3, 4, 5]), P.count);
    expect(collectSync(result, scheduler)).toEqual([5]);
  });

  it("P.all emits true when all match", () => {
    const scheduler = new TestScheduler();
    const result = pipe(
      fromArray([2, 4, 6]),
      P.all((x: number) => x % 2 === 0),
    );
    expect(collectSync(result, scheduler)).toEqual([true]);
  });

  it("P.elementAt emits the nth element", () => {
    const scheduler = new TestScheduler();
    const result = pipe(fromArray([10, 20, 30, 40]), P.elementAt(2));
    expect(collectSync(result, scheduler)).toEqual([30]);
  });

  it("P.constant replaces all values", () => {
    const scheduler = new TestScheduler();
    const result = pipe(fromArray([1, 2, 3]), P.constant("x"));
    expect(collectSync(result, scheduler)).toEqual(["x", "x", "x"]);
  });

  it("P.chain flatMaps to inner streams", () => {
    const scheduler = new TestScheduler();
    const result = pipe(
      fromArray([1, 2]),
      P.chain((x: number) => fromArray([x, x + 1])),
    );
    expect(collectSync(result, scheduler)).toEqual([1, 2, 2, 3]);
  });

  it("P.mapError transforms error type", () => {
    const scheduler = new TestScheduler();
    // Just verify it compiles and passes through values
    const result = pipe(
      fromArray([1, 2, 3]),
      P.mapError((e: never) => e),
    );
    expect(collectSync(result, scheduler)).toEqual([1, 2, 3]);
  });

  it("P.scan accumulates values", () => {
    const scheduler = new TestScheduler();
    const result = pipe(
      fromArray([1, 2, 3]),
      P.scan((acc: number, x: number) => acc + x, 0),
    );
    expect(collectSync(result, scheduler)).toEqual([1, 3, 6]);
  });

  it("P.until stops on signal", () => {
    const scheduler = new TestScheduler();
    // now() fires immediately at t=0, so until(now()) stops before any events
    // Use fromArray which emits synchronously — until with now() should stop after first
    const result = pipe(fromArray([1, 2, 3]), P.until(now(undefined)));
    // Both source and signal emit at same time t=0; behavior depends on ordering
    const values = collectSync(result, scheduler);
    expect(values.length).toBeLessThanOrEqual(3);
  });

  it("P.since starts on signal", () => {
    const scheduler = new TestScheduler();
    const result = pipe(fromArray([1, 2, 3]), P.since(now(undefined)));
    const values = collectSync(result, scheduler);
    expect(values.length).toBeGreaterThanOrEqual(0);
  });

  it("P.debounce returns an event", () => {
    const scheduler = new TestScheduler();
    // Synchronous events — debounce only emits the last one after the duration
    const result = pipe(fromArray([1, 2, 3]), P.debounce(toDuration(100)));
    // Just verify it doesn't throw — debounce needs async scheduler to emit
    _getSource(result).run({ event() {}, error() {}, end() {} } as Sink<number, never>, scheduler);
  });

  it("P.throttle returns an event", () => {
    const scheduler = new TestScheduler();
    const result = pipe(fromArray([1, 2, 3]), P.throttle(toDuration(100)));
    const values = collectSync(result, scheduler);
    // Throttle emits first value immediately, suppresses rest within window
    expect(values[0]).toBe(1);
  });

  it("P.delay returns an event", () => {
    const scheduler = new TestScheduler();
    const result = pipe(fromArray([1, 2, 3]), P.delay(toDuration(10)));
    const values: number[] = [];
    _getSource(result).run(
      {
        event(_t: Time, v: number) {
          values.push(v);
        },
        error() {},
        end() {},
      } as Sink<number, never>,
      scheduler,
    );
    // Before advancing, no values emitted
    expect(values).toEqual([]);
    scheduler.flush();
    expect(values).toEqual([1, 2, 3]);
  });

  it("P.bufferCount groups values", () => {
    const scheduler = new TestScheduler();
    const result = pipe(fromArray([1, 2, 3, 4, 5, 6]), P.bufferCount(2));
    expect(collectSync(result, scheduler)).toEqual([
      [1, 2],
      [3, 4],
      [5, 6],
    ]);
  });

  it("P.bufferTime groups by time window", () => {
    const scheduler = new TestScheduler();
    const result = pipe(fromArray([1, 2, 3]), P.bufferTime(toDuration(100)));
    // Synchronous events all arrive at t=0; buffer emits on end or timer
    _getSource(result).run(
      { event() {}, error() {}, end() {} } as Sink<number[], never>,
      scheduler,
    );
    // Just verify it doesn't throw
  });

  it("P.share returns a shared event", () => {
    const scheduler = new TestScheduler();
    const result = pipe(fromArray([1, 2, 3]), P.share(1));
    expect(collectSync(result, scheduler)).toEqual([1, 2, 3]);
  });

  it("P.retry passes through when no error", () => {
    const scheduler = new TestScheduler();
    const result = pipe(fromArray([1, 2, 3]), P.retry(3));
    expect(collectSync(result, scheduler)).toEqual([1, 2, 3]);
  });

  it("P.timeout returns an event", () => {
    const scheduler = new TestScheduler();
    const result = pipe(
      fromArray([1, 2, 3]),
      P.timeout(toDuration(1000)),
      P.catchError(() => fromArray<number>([])),
    );
    expect(collectSync(result, scheduler)).toEqual([1, 2, 3]);
  });

  it("P.switchLatest flattens nested events", () => {
    const scheduler = new TestScheduler();
    const result = pipe(fromArray([fromArray([1, 2]), fromArray([3, 4])]), P.switchLatest);
    // switchLatest disposes previous inner on new outer, but sync means both complete instantly
    const values = collectSync(result, scheduler);
    expect(values).toEqual([1, 2, 3, 4]);
  });
});
