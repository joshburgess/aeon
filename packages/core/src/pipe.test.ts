import { type Event, type Sink, type Time, toTime } from "@pulse/types";
import { describe, expect, expectTypeOf, it } from "vitest";
import { reduce } from "./combinators/terminal.js";
import { fromArray } from "./constructors.js";
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

  it("works with skip and slice", () => {
    const scheduler = new TestScheduler();
    const result = pipe(fromArray([1, 2, 3, 4, 5, 6, 7, 8]), P.skip(2), P.take(3));
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

  it("P.takeWhile and P.skipWhile", () => {
    const scheduler = new TestScheduler();
    const tw = pipe(
      fromArray([1, 2, 3, 4, 5]),
      P.takeWhile((x: number) => x < 4),
    );
    expect(collectSync(tw, scheduler)).toEqual([1, 2, 3]);

    const sw = pipe(
      fromArray([1, 2, 3, 4, 5]),
      P.skipWhile((x: number) => x < 3),
    );
    expect(collectSync(sw, scheduler)).toEqual([3, 4, 5]);
  });

  it("P.slice", () => {
    const scheduler = new TestScheduler();
    const result = pipe(fromArray([1, 2, 3, 4, 5]), P.slice(1, 4));
    expect(collectSync(result, scheduler)).toEqual([2, 3, 4]);
  });
});
