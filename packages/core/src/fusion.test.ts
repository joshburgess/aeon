import { type Sink, type Time, toTime } from "aeon-types";
import { describe, expect, it } from "vitest";
import { filter } from "./combinators/filter.js";
import { map } from "./combinators/map.js";
import { merge } from "./combinators/merge.js";
import { scan } from "./combinators/scan.js";
import { drop, take } from "./combinators/slice.js";
import { drain, observe, reduce } from "./combinators/terminal.js";
import { empty, fromArray, now } from "./constructors.js";
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

  describe("Algebraic simplifications", () => {
    it("map(f, empty()) → empty()", () => {
      const scheduler = new TestScheduler();
      const result = collectSync<number>(
        map((x: number) => x + 1, empty()),
        scheduler,
      );
      expect(result).toEqual([]);
    });

    it("filter(p, empty()) → empty()", () => {
      const scheduler = new TestScheduler();
      const result = collectSync<number>(
        filter((x: number) => x > 0, empty()),
        scheduler,
      );
      expect(result).toEqual([]);
    });

    it("map(f, now(x)) → now(f(x)) — constant folding", () => {
      const scheduler = new TestScheduler();
      const result = collectSync<number>(
        map((x: number) => x * 10, now(5)),
        scheduler,
      );
      expect(result).toEqual([50]);
    });

    it("filter(p, now(x)) passes when predicate holds", () => {
      const scheduler = new TestScheduler();
      const result = collectSync<number>(
        filter((x: number) => x > 0, now(5)),
        scheduler,
      );
      expect(result).toEqual([5]);
    });

    it("filter(p, now(x)) → empty() when predicate fails", () => {
      const scheduler = new TestScheduler();
      const result = collectSync<number>(
        filter((x: number) => x > 10, now(5)),
        scheduler,
      );
      expect(result).toEqual([]);
    });

    it("take(n, empty()) → empty()", () => {
      const scheduler = new TestScheduler();
      const result = collectSync<number>(take(5, empty()), scheduler);
      expect(result).toEqual([]);
    });

    it("drop(n, empty()) → empty()", () => {
      const scheduler = new TestScheduler();
      const result = collectSync<number>(drop(5, empty()), scheduler);
      expect(result).toEqual([]);
    });

    it("scan(f, seed, empty()) → empty()", () => {
      const scheduler = new TestScheduler();
      const result = collectSync<number>(
        scan((a: number, b: number) => a + b, 0, empty()),
        scheduler,
      );
      expect(result).toEqual([]);
    });
  });

  describe("Slice fusion", () => {
    it("take(n, take(m, s)) → take(min(n, m), s)", () => {
      const scheduler = new TestScheduler();
      const result = collectSync<number>(
        take(3, take(5, fromArray([1, 2, 3, 4, 5, 6]))),
        scheduler,
      );
      expect(result).toEqual([1, 2, 3]);
    });

    it("take(5, take(3, s)) uses the smaller", () => {
      const scheduler = new TestScheduler();
      const result = collectSync<number>(
        take(5, take(3, fromArray([1, 2, 3, 4, 5, 6]))),
        scheduler,
      );
      expect(result).toEqual([1, 2, 3]);
    });

    it("drop(n, drop(m, s)) → drop(n + m, s)", () => {
      const scheduler = new TestScheduler();
      const result = collectSync<number>(
        drop(2, drop(3, fromArray([1, 2, 3, 4, 5, 6, 7]))),
        scheduler,
      );
      expect(result).toEqual([6, 7]);
    });
  });

  describe("Merge flattening", () => {
    it("merge(a, merge(b, c)) flattens correctly", () => {
      const scheduler = new TestScheduler();
      const a = fromArray([1, 2]);
      const b = fromArray([3, 4]);
      const c = fromArray([5, 6]);
      const result = collectSync<number>(merge(a, merge(b, c)), scheduler);
      expect(result).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it("merge(merge(a, b), merge(c, d)) double-flatten", () => {
      const scheduler = new TestScheduler();
      const result = collectSync<number>(
        merge(merge(fromArray([1]), fromArray([2])), merge(fromArray([3]), fromArray([4]))),
        scheduler,
      );
      expect(result).toEqual([1, 2, 3, 4]);
    });
  });

  describe("Scan∘map fusion", () => {
    it("scan(f, seed, map(g, s)) produces correct results", () => {
      const scheduler = new TestScheduler();
      // scan(+, 0, map(x => x * 2, [1,2,3])) → [2, 6, 12]
      const result = collectSync<number>(
        scan(
          (acc: number, x: number) => acc + x,
          0,
          map((x: number) => x * 2, fromArray([1, 2, 3])),
        ),
        scheduler,
      );
      expect(result).toEqual([2, 6, 12]);
    });

    it("scan∘map fusion matches unfused for large arrays", () => {
      const scheduler = new TestScheduler();
      const arr = Array.from({ length: 10_000 }, (_, i) => i);
      const fused = collectSync<number>(
        scan(
          (acc: number, x: number) => acc + x,
          0,
          map((x: number) => x * 3, fromArray(arr)),
        ),
        scheduler,
      );
      // Compute expected manually
      let acc = 0;
      const expected = arr.map((x) => {
        acc += x * 3;
        return acc;
      });
      expect(fused).toEqual(expected);
    });
  });

  describe("Sync loop compilation", () => {
    it("reduce(f, seed, fromArray) uses sync fast path", async () => {
      const scheduler = new TestScheduler();
      const result = await reduce(
        (acc: number, x: number) => acc + x,
        0,
        fromArray([1, 2, 3, 4, 5]),
        scheduler,
      );
      expect(result).toBe(15);
    });

    it("reduce on empty stream returns seed", async () => {
      const scheduler = new TestScheduler();
      const result = await reduce((acc: number, x: number) => acc + x, 42, empty(), scheduler);
      expect(result).toBe(42);
    });

    it("reduce on now(x) returns f(seed, x)", async () => {
      const scheduler = new TestScheduler();
      const result = await reduce((acc: number, x: number) => acc + x, 10, now(5), scheduler);
      expect(result).toBe(15);
    });

    it("drain(fromArray) completes via sync path", async () => {
      const scheduler = new TestScheduler();
      await drain(fromArray([1, 2, 3]), scheduler);
    });

    it("observe(f, fromArray) runs side effects via sync path", async () => {
      const scheduler = new TestScheduler();
      const seen: number[] = [];
      await observe((x: number) => seen.push(x), fromArray([10, 20, 30]), scheduler);
      expect(seen).toEqual([10, 20, 30]);
    });

    it("scan + syncIterate produces correct accumulation", async () => {
      const scheduler = new TestScheduler();
      const result = await reduce(
        (acc: number, x: number) => acc + x,
        0,
        scan((a: number, b: number) => a + b, 0, fromArray([1, 2, 3])),
        scheduler,
      );
      // scan produces [1, 3, 6], reduce sums them: 1 + 3 + 6 = 10
      expect(result).toBe(10);
    });

    it("take(n) early exit via syncIterate", async () => {
      const scheduler = new TestScheduler();
      const result = await reduce(
        (acc: number, x: number) => acc + x,
        0,
        take(3, fromArray([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])),
        scheduler,
      );
      expect(result).toBe(6);
    });

    it("drop(n) via syncIterate", async () => {
      const scheduler = new TestScheduler();
      const result = await reduce(
        (acc: number, x: number) => acc + x,
        0,
        drop(7, fromArray([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])),
        scheduler,
      );
      expect(result).toBe(27);
    });

    it("scan∘map fusion + syncIterate", async () => {
      const scheduler = new TestScheduler();
      // scan(+, 0, map(x*2, fromArray)) → fused ScanSource on ArraySource
      const result = await reduce(
        (acc: number, x: number) => acc + x,
        0,
        scan(
          (a: number, b: number) => a + b,
          0,
          map((x: number) => x * 2, fromArray([1, 2, 3])),
        ),
        scheduler,
      );
      // map produces [2, 4, 6], scan produces [2, 6, 12], reduce sums: 2 + 6 + 12 = 20
      expect(result).toBe(20);
    });

    it("merge syncIterate concatenates all sources", async () => {
      const scheduler = new TestScheduler();
      const result = await reduce(
        (acc: number, x: number) => acc + x,
        0,
        merge(fromArray([1, 2]), fromArray([3, 4])),
        scheduler,
      );
      expect(result).toBe(10);
    });

    it("filter→map→reduce falls back to sink protocol correctly", async () => {
      const scheduler = new TestScheduler();
      const result = await reduce(
        (acc: number, x: number) => acc + x,
        0,
        map(
          (x: number) => x * 2,
          filter((x: number) => x % 2 === 0, fromArray([1, 2, 3, 4, 5])),
        ),
        scheduler,
      );
      // filter: [2, 4], map: [4, 8], reduce: 12
      expect(result).toBe(12);
    });

    it("large array reduce via sync path matches manual", async () => {
      const scheduler = new TestScheduler();
      const n = 100_000;
      const arr = Array.from({ length: n }, (_, i) => i);
      const result = await reduce(
        (acc: number, x: number) => acc + x,
        0,
        fromArray(arr),
        scheduler,
      );
      const expected = (n * (n - 1)) / 2;
      expect(result).toBe(expected);
    });
  });
});
