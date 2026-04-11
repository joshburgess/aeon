import { type Sink, type Time, toDuration, toTime } from "@pulse/types";
import { describe, expect, it } from "vitest";
import { chain } from "./combinators/chain.js";
import { combine, zip } from "./combinators/combine.js";
import { constant } from "./combinators/constant.js";
import { catchError, mapError, throwError } from "./combinators/error.js";
import { filter } from "./combinators/filter.js";
import { map } from "./combinators/map.js";
import { merge } from "./combinators/merge.js";
import { mapAsync } from "./combinators/mapAsync.js";
import { mergeMapConcurrently } from "./combinators/mergeMap.js";
import { scan } from "./combinators/scan.js";
import { since, skip, skipWhile, slice, take, takeWhile, until } from "./combinators/slice.js";
import { switchLatest } from "./combinators/switch.js";
import { tap } from "./combinators/tap.js";
import { drain, observe, reduce } from "./combinators/terminal.js";
import { empty, fromArray, never, now } from "./constructors.js";
import { _createEvent, _getSource } from "./internal/event.js";
import { TestScheduler } from "./internal/testScheduler.js";

/** Helper: collect all values from a synchronous event. */
function collectSync<A>(event: Parameters<typeof _getSource>[0], scheduler: TestScheduler): A[] {
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

describe("map", () => {
  it("transforms each value", () => {
    const scheduler = new TestScheduler();
    const result = collectSync<number>(
      map((x: number) => x * 2, fromArray([1, 2, 3])),
      scheduler,
    );
    expect(result).toEqual([2, 4, 6]);
  });

  it("Functor identity: map(id, e) === e", () => {
    const scheduler = new TestScheduler();
    const source = [1, 2, 3, 4, 5];
    const identity = (x: number) => x;
    const result = collectSync<number>(map(identity, fromArray(source)), scheduler);
    expect(result).toEqual(source);
  });

  it("Functor composition: map(f . g) === map(f) . map(g)", () => {
    const scheduler = new TestScheduler();
    const f = (x: number) => x + 1;
    const g = (x: number) => x * 2;
    const source = fromArray([1, 2, 3]);

    const composed = collectSync<number>(
      map((x: number) => f(g(x)), source),
      scheduler,
    );
    const piped = collectSync<number>(map(f, map(g, fromArray([1, 2, 3]))), scheduler);
    expect(composed).toEqual(piped);
  });
});

describe("filter", () => {
  it("keeps values satisfying the predicate", () => {
    const scheduler = new TestScheduler();
    const result = collectSync<number>(
      filter((x: number) => x % 2 === 0, fromArray([1, 2, 3, 4, 5])),
      scheduler,
    );
    expect(result).toEqual([2, 4]);
  });

  it("returns empty for no matches", () => {
    const scheduler = new TestScheduler();
    const result = collectSync<number>(
      filter(() => false, fromArray([1, 2, 3])),
      scheduler,
    );
    expect(result).toEqual([]);
  });
});

describe("tap", () => {
  it("runs side effect without changing values", () => {
    const scheduler = new TestScheduler();
    const sideEffects: number[] = [];
    const result = collectSync<number>(
      tap((x: number) => sideEffects.push(x), fromArray([1, 2, 3])),
      scheduler,
    );
    expect(result).toEqual([1, 2, 3]);
    expect(sideEffects).toEqual([1, 2, 3]);
  });
});

describe("constant", () => {
  it("replaces every value with a constant", () => {
    const scheduler = new TestScheduler();
    const result = collectSync<string>(constant("x", fromArray([1, 2, 3])), scheduler);
    expect(result).toEqual(["x", "x", "x"]);
  });
});

describe("scan", () => {
  it("emits running accumulation", () => {
    const scheduler = new TestScheduler();
    const result = collectSync<number>(
      scan((acc: number, x: number) => acc + x, 0, fromArray([1, 2, 3, 4])),
      scheduler,
    );
    expect(result).toEqual([1, 3, 6, 10]);
  });
});

describe("reduce", () => {
  it("folds all values into a single result", async () => {
    const scheduler = new TestScheduler();
    const result = await reduce(
      (acc: number, x: number) => acc + x,
      0,
      fromArray([1, 2, 3, 4]),
      scheduler,
    );
    expect(result).toBe(10);
  });
});

describe("observe", () => {
  it("runs side effect for each value", async () => {
    const scheduler = new TestScheduler();
    const seen: number[] = [];
    await observe((x: number) => seen.push(x), fromArray([1, 2, 3]), scheduler);
    expect(seen).toEqual([1, 2, 3]);
  });
});

describe("drain", () => {
  it("activates the stream and resolves when done", async () => {
    const scheduler = new TestScheduler();
    await drain(fromArray([1, 2, 3]), scheduler);
    // Just verify it doesn't throw
  });
});

describe("take", () => {
  it("takes the first n values", () => {
    const scheduler = new TestScheduler();
    const result = collectSync<number>(take(2, fromArray([1, 2, 3, 4, 5])), scheduler);
    expect(result).toEqual([1, 2]);
  });

  it("take(0) emits nothing", () => {
    const scheduler = new TestScheduler();
    const result = collectSync<number>(take(0, fromArray([1, 2, 3])), scheduler);
    expect(result).toEqual([]);
  });

  it("take(n) where n > length returns all", () => {
    const scheduler = new TestScheduler();
    const result = collectSync<number>(take(10, fromArray([1, 2])), scheduler);
    expect(result).toEqual([1, 2]);
  });
});

describe("skip", () => {
  it("skips the first n values", () => {
    const scheduler = new TestScheduler();
    const result = collectSync<number>(skip(2, fromArray([1, 2, 3, 4, 5])), scheduler);
    expect(result).toEqual([3, 4, 5]);
  });

  it("skip(0) passes all through", () => {
    const scheduler = new TestScheduler();
    const result = collectSync<number>(skip(0, fromArray([1, 2, 3])), scheduler);
    expect(result).toEqual([1, 2, 3]);
  });
});

describe("takeWhile", () => {
  it("takes values while predicate holds", () => {
    const scheduler = new TestScheduler();
    const result = collectSync<number>(
      takeWhile((x: number) => x < 4, fromArray([1, 2, 3, 4, 5])),
      scheduler,
    );
    expect(result).toEqual([1, 2, 3]);
  });
});

describe("skipWhile", () => {
  it("skips values while predicate holds", () => {
    const scheduler = new TestScheduler();
    const result = collectSync<number>(
      skipWhile((x: number) => x < 3, fromArray([1, 2, 3, 4, 5])),
      scheduler,
    );
    expect(result).toEqual([3, 4, 5]);
  });
});

describe("slice", () => {
  it("takes a contiguous slice", () => {
    const scheduler = new TestScheduler();
    const result = collectSync<number>(slice(1, 4, fromArray([1, 2, 3, 4, 5])), scheduler);
    expect(result).toEqual([2, 3, 4]);
  });
});

describe("until", () => {
  it("takes values until the signal fires", () => {
    const scheduler = new TestScheduler();
    let pushMain: ((t: Time, v: number) => void) | undefined;
    let endMain: ((t: Time) => void) | undefined;
    let pushSignal: ((t: Time) => void) | undefined;
    const main = _createEvent<number, never>({
      run(sink) {
        pushMain = (t, v) => sink.event(t, v);
        endMain = (t) => sink.end(t);
        return { dispose() { pushMain = undefined; } };
      },
    });
    const signal = _createEvent<unknown, never>({
      run(sink) {
        pushSignal = (t) => sink.event(t, undefined);
        return { dispose() { pushSignal = undefined; } };
      },
    });

    const values: number[] = [];
    let ended = false;
    _getSource(until(signal, main)).run(
      {
        event(_t: Time, v: number) { values.push(v); },
        error() {},
        end() { ended = true; },
      },
      scheduler,
    );

    pushMain?.(toTime(0), 1);
    pushMain?.(toTime(1), 2);
    expect(values).toEqual([1, 2]);
    expect(ended).toBe(false);

    // Signal fires — stream should end
    pushSignal?.(toTime(2));
    expect(ended).toBe(true);

    // Values after signal should be ignored
    pushMain?.(toTime(3), 3);
    expect(values).toEqual([1, 2]);
  });

  it("passes through all values if signal never fires", () => {
    const scheduler = new TestScheduler();
    let pushMain: ((t: Time, v: number) => void) | undefined;
    let endMain: ((t: Time) => void) | undefined;
    const main = _createEvent<number, never>({
      run(sink) {
        pushMain = (t, v) => sink.event(t, v);
        endMain = (t) => sink.end(t);
        return { dispose() { pushMain = undefined; } };
      },
    });
    const signal = _createEvent<unknown, never>({
      run() {
        return { dispose() {} };
      },
    });

    const values: number[] = [];
    let ended = false;
    _getSource(until(signal, main)).run(
      {
        event(_t: Time, v: number) { values.push(v); },
        error() {},
        end() { ended = true; },
      },
      scheduler,
    );

    pushMain?.(toTime(0), 1);
    pushMain?.(toTime(1), 2);
    endMain?.(toTime(2));
    expect(values).toEqual([1, 2]);
    expect(ended).toBe(true);
  });
});

describe("since", () => {
  it("skips values until the signal fires, then passes through", () => {
    const scheduler = new TestScheduler();
    let pushMain: ((t: Time, v: number) => void) | undefined;
    let endMain: ((t: Time) => void) | undefined;
    let pushSignal: ((t: Time) => void) | undefined;
    const main = _createEvent<number, never>({
      run(sink) {
        pushMain = (t, v) => sink.event(t, v);
        endMain = (t) => sink.end(t);
        return { dispose() { pushMain = undefined; } };
      },
    });
    const signal = _createEvent<unknown, never>({
      run(sink) {
        pushSignal = (t) => sink.event(t, undefined);
        return { dispose() { pushSignal = undefined; } };
      },
    });

    const values: number[] = [];
    let ended = false;
    _getSource(since(signal, main)).run(
      {
        event(_t: Time, v: number) { values.push(v); },
        error() {},
        end() { ended = true; },
      },
      scheduler,
    );

    pushMain?.(toTime(0), 1);
    pushMain?.(toTime(1), 2);
    expect(values).toEqual([]);

    // Signal fires — start passing through
    pushSignal?.(toTime(2));

    pushMain?.(toTime(3), 3);
    pushMain?.(toTime(4), 4);
    expect(values).toEqual([3, 4]);

    endMain?.(toTime(5));
    expect(ended).toBe(true);
  });

  it("passes all values if signal fires immediately", () => {
    const scheduler = new TestScheduler();
    let pushMain: ((t: Time, v: number) => void) | undefined;
    let pushSignal: ((t: Time) => void) | undefined;
    const main = _createEvent<number, never>({
      run(sink) {
        pushMain = (t, v) => sink.event(t, v);
        return { dispose() { pushMain = undefined; } };
      },
    });
    const signal = _createEvent<unknown, never>({
      run(sink) {
        pushSignal = (t) => sink.event(t, undefined);
        return { dispose() { pushSignal = undefined; } };
      },
    });

    const values: number[] = [];
    _getSource(since(signal, main)).run(
      {
        event(_t: Time, v: number) { values.push(v); },
        error() {},
        end() {},
      },
      scheduler,
    );

    pushSignal?.(toTime(0));
    pushMain?.(toTime(1), 10);
    pushMain?.(toTime(2), 20);
    expect(values).toEqual([10, 20]);
  });
});

describe("merge", () => {
  it("interleaves synchronous sources", () => {
    const scheduler = new TestScheduler();
    const a = fromArray([1, 2]);
    const b = fromArray([3, 4]);
    const result = collectSync<number>(merge(a, b), scheduler);
    expect(result).toEqual([1, 2, 3, 4]);
  });

  it("merge of zero events ends immediately", () => {
    const scheduler = new TestScheduler();
    let ended = false;
    _getSource(merge<number, never>()).run(
      {
        event() {},
        error() {},
        end() {
          ended = true;
        },
      },
      scheduler,
    );
    expect(ended).toBe(true);
  });

  it("merge of one event is identity", () => {
    const scheduler = new TestScheduler();
    const result = collectSync<number>(merge(fromArray([1, 2, 3])), scheduler);
    expect(result).toEqual([1, 2, 3]);
  });
});

describe("combine", () => {
  it("combines latest values from both streams", () => {
    const scheduler = new TestScheduler();
    const a = fromArray([1, 2]);
    const b = fromArray([10, 20]);
    const result = collectSync<number>(
      combine((x: number, y: number) => x + y, a, b),
      scheduler,
    );
    // a emits 1 (no b yet), a emits 2 (no b yet), b emits 10 (has a=2), b emits 20 (has a=2)
    expect(result).toEqual([12, 22]);
  });
});

describe("zip", () => {
  it("pairs elements from both streams", () => {
    const scheduler = new TestScheduler();
    const a = fromArray([1, 2, 3]);
    const b = fromArray(["a", "b"]);
    const result = collectSync<[number, string]>(zip(a, b), scheduler);
    expect(result).toEqual([
      [1, "a"],
      [2, "b"],
    ]);
  });
});

describe("switchLatest", () => {
  it("switches to the latest inner event", () => {
    const scheduler = new TestScheduler();
    // Outer emits two inner events synchronously; switchLatest should
    // dispose the first and follow the second
    const inner1 = fromArray([1, 2]);
    const inner2 = fromArray([3, 4]);
    const outer = fromArray([inner1, inner2]);
    const result = collectSync<number>(switchLatest(outer), scheduler);
    // inner1 emits 1,2 then inner2 replaces it and emits 3,4
    // Since both are synchronous, inner1 completes before inner2 starts
    expect(result).toEqual([1, 2, 3, 4]);
  });
});

describe("mergeMapConcurrently", () => {
  it("maps and merges with concurrency", () => {
    const scheduler = new TestScheduler();
    const result = collectSync<number>(
      mergeMapConcurrently(
        (x: number) => fromArray([x * 10, x * 10 + 1]),
        Number.POSITIVE_INFINITY,
        fromArray([1, 2]),
      ),
      scheduler,
    );
    expect(result).toEqual([10, 11, 20, 21]);
  });
});

describe("error handling", () => {
  describe("throwError", () => {
    it("immediately errors", () => {
      const scheduler = new TestScheduler();
      const errors: string[] = [];
      _getSource(throwError<number, string>("boom")).run(
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
  });

  describe("catchError", () => {
    it("recovers from an error with a new stream", () => {
      const scheduler = new TestScheduler();
      const recovered = catchError(
        (err: string) => fromArray([err.length]),
        throwError<number, string>("boom"),
      );
      const result = collectSync<number>(recovered, scheduler);
      expect(result).toEqual([4]);
    });

    it("catchError(handler, throwError(e)) === handler(e)", () => {
      const scheduler = new TestScheduler();
      const handler = (err: string) => fromArray([err.toUpperCase()]);

      const viaRecovery = collectSync<string>(
        catchError(handler, throwError<string, string>("hello")),
        scheduler,
      );
      const direct = collectSync<string>(handler("hello"), scheduler);
      expect(viaRecovery).toEqual(direct);
    });
  });

  describe("mapError", () => {
    it("transforms the error value", () => {
      const scheduler = new TestScheduler();
      const errors: number[] = [];
      const mapped = mapError((e: string) => e.length, throwError<number, string>("boom"));
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
      expect(errors).toEqual([4]);
    });
  });
});

describe("chain (flatMap)", () => {
  it("concatMaps inner events", () => {
    const scheduler = new TestScheduler();
    const result = collectSync<number>(
      chain((x: number) => fromArray([x, x * 10]), fromArray([1, 2, 3])),
      scheduler,
    );
    expect(result).toEqual([1, 10, 2, 20, 3, 30]);
  });

  it("Monad left identity: chain(f, of(a)) === f(a)", () => {
    const scheduler = new TestScheduler();
    const f = (x: number) => fromArray([x + 1, x + 2]);

    const viaChain = collectSync<number>(chain(f, now(5)), scheduler);
    const direct = collectSync<number>(f(5), scheduler);
    expect(viaChain).toEqual(direct);
  });

  it("Monad right identity: chain(of, m) === m", () => {
    const scheduler = new TestScheduler();
    const m = fromArray([1, 2, 3]);

    const viaChain = collectSync<number>(chain(now, m), scheduler);
    const direct = collectSync<number>(fromArray([1, 2, 3]), scheduler);
    expect(viaChain).toEqual(direct);
  });

  it("Monad associativity: chain(g, chain(f, m)) === chain(x => chain(g, f(x)), m)", () => {
    const scheduler = new TestScheduler();
    const f = (x: number) => fromArray([x, x + 1]);
    const g = (x: number) => fromArray([x * 10]);
    const m = fromArray([1, 2]);

    const left = collectSync<number>(chain(g, chain(f, m)), scheduler);
    const right = collectSync<number>(
      chain((x: number) => chain(g, f(x)), fromArray([1, 2])),
      scheduler,
    );
    expect(left).toEqual(right);
  });
});

describe("filter -> map -> reduce pipeline", () => {
  it("processes 10k elements correctly", async () => {
    const scheduler = new TestScheduler();
    const n = 10_000;
    const arr = Array.from({ length: n }, (_, i) => i);
    const pipeline = map(
      (x: number) => x * 2,
      filter((x: number) => x % 2 === 0, fromArray(arr)),
    );
    const result = await reduce((acc: number, x: number) => acc + x, 0, pipeline, scheduler);
    // Sum of 2*x for even x from 0 to 9999
    const expected = arr
      .filter((x) => x % 2 === 0)
      .map((x) => x * 2)
      .reduce((a, b) => a + b, 0);
    expect(result).toBe(expected);
  });
});

describe("mapAsync", () => {
  it("applies an async function to each value", async () => {
    const scheduler = new TestScheduler();
    const event = fromArray([1, 2, 3]);
    const result: number[] = [];

    const mapped = mapAsync(
      async (x: number) => x * 10,
      Infinity,
      event,
    );

    await new Promise<void>((resolve) => {
      _getSource(mapped).run(
        {
          event(_t: Time, v: number) { result.push(v); },
          error() {},
          end() { resolve(); },
        },
        scheduler,
      );
    });

    expect(result.sort((a, b) => a - b)).toEqual([10, 20, 30]);
  });

  it("respects concurrency limit", async () => {
    const scheduler = new TestScheduler();
    let concurrent = 0;
    let maxConcurrent = 0;
    const resolvers: Array<(v: number) => void> = [];

    const event = fromArray([1, 2, 3, 4]);
    const mapped = mapAsync(
      (x: number) =>
        new Promise<number>((resolve) => {
          concurrent++;
          maxConcurrent = Math.max(maxConcurrent, concurrent);
          resolvers.push((v) => {
            concurrent--;
            resolve(v);
          });
        }),
      2,
      event,
    );

    const result: number[] = [];
    const done = new Promise<void>((resolve) => {
      _getSource(mapped).run(
        {
          event(_t: Time, v: number) { result.push(v); },
          error() {},
          end() { resolve(); },
        },
        scheduler,
      );
    });

    // 2 started, 2 buffered
    await Promise.resolve(); // let microtasks settle
    expect(maxConcurrent).toBe(2);

    // Resolve first two
    resolvers[0]!(10);
    resolvers[1]!(20);
    await Promise.resolve();
    await Promise.resolve();

    // Resolve remaining
    resolvers[2]!(30);
    resolvers[3]!(40);
    await done;

    expect(result.sort((a, b) => a - b)).toEqual([10, 20, 30, 40]);
    expect(maxConcurrent).toBe(2);
  });

  it("propagates async errors", async () => {
    const scheduler = new TestScheduler();
    const event = fromArray([1]);
    const mapped = mapAsync(
      async (_x: number) => { throw new Error("boom"); },
      1,
      event,
    );

    const error = await new Promise<unknown>((resolve) => {
      _getSource(mapped).run(
        {
          event() {},
          error(_t: Time, err: unknown) { resolve(err); },
          end() {},
        },
        scheduler,
      );
    });

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("boom");
  });
});
