import { type Sink, type Time, toTime } from "@pulse/types";
import { describe, expect, it } from "vitest";
import { filter } from "./combinators/filter.js";
import { map } from "./combinators/map.js";
import { reduce } from "./combinators/terminal.js";
import { fromArray } from "./constructors.js";
import { _getSource } from "./internal/event.js";
import { TestScheduler } from "./internal/testScheduler.js";

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

describe("Pipeline fusion", () => {
  describe("map∘map fusion", () => {
    it("produces correct results with composed functions", () => {
      const scheduler = new TestScheduler();
      const f = (x: number) => x + 1;
      const g = (x: number) => x * 2;
      // This should fuse into a single map(x => (x * 2) + 1)
      const result = collectSync<number>(map(f, map(g, fromArray([1, 2, 3]))), scheduler);
      expect(result).toEqual([3, 5, 7]);
    });

    it("triple map fusion works", () => {
      const scheduler = new TestScheduler();
      const result = collectSync<number>(
        map(
          (x: number) => x + 100,
          map(
            (x: number) => x * 3,
            map((x: number) => x + 1, fromArray([1, 2, 3])),
          ),
        ),
        scheduler,
      );
      // (1+1)*3+100=106, (2+1)*3+100=109, (3+1)*3+100=112
      expect(result).toEqual([106, 109, 112]);
    });
  });

  describe("filter∘filter fusion", () => {
    it("conjoins predicates", () => {
      const scheduler = new TestScheduler();
      const result = collectSync<number>(
        filter(
          (x: number) => x > 2,
          filter((x: number) => x < 8, fromArray([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])),
        ),
        scheduler,
      );
      expect(result).toEqual([3, 4, 5, 6, 7]);
    });
  });

  describe("map∘filter fusion (filter then map → filterMap)", () => {
    it("filters then maps in a single node", () => {
      const scheduler = new TestScheduler();
      const result = collectSync<string>(
        map(
          (x: number) => `v${x}`,
          filter((x: number) => x % 2 === 0, fromArray([1, 2, 3, 4, 5])),
        ),
        scheduler,
      );
      expect(result).toEqual(["v2", "v4"]);
    });
  });

  describe("filter∘map fusion (map then filter → mapFilter)", () => {
    it("maps then filters in a single node", () => {
      const scheduler = new TestScheduler();
      const result = collectSync<number>(
        filter(
          (x: number) => x > 5,
          map((x: number) => x * 2, fromArray([1, 2, 3, 4, 5])),
        ),
        scheduler,
      );
      expect(result).toEqual([6, 8, 10]);
    });
  });

  describe("fusion correctness on large pipeline", () => {
    it("filter→map→reduce over 100k elements matches unfused", async () => {
      const scheduler = new TestScheduler();
      const n = 100_000;
      const arr = Array.from({ length: n }, (_, i) => i);

      const pipeline = map(
        (x: number) => x * 2,
        filter((x: number) => x % 3 === 0, fromArray(arr)),
      );

      const result = await reduce((acc: number, x: number) => acc + x, 0, pipeline, scheduler);

      const expected = arr
        .filter((x) => x % 3 === 0)
        .map((x) => x * 2)
        .reduce((a, b) => a + b, 0);

      expect(result).toBe(expected);
    });
  });
});
