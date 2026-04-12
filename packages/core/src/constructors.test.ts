import { type Time, toDuration, toTime } from "aeon-types";
import type { Sink } from "aeon-types";
import { describe, expect, it } from "vitest";
import { at, empty, fromArray, fromIterable, never, now, periodic } from "./constructors.js";
import { _getSource } from "./internal/event.js";
import { TestScheduler } from "./internal/testScheduler.js";

/** Collect events from a stream into an array. */
function collect<A>(
  event: ReturnType<typeof empty>,
  scheduler: TestScheduler,
): { values: [Time, A][]; errors: unknown[]; ended: boolean } {
  const result: { values: [Time, A][]; errors: unknown[]; ended: boolean } = {
    values: [],
    errors: [],
    ended: false,
  };

  const sink: Sink<A, never> = {
    event(time: Time, value: A) {
      result.values.push([time, value as A]);
    },
    error(time: Time, err: never) {
      result.errors.push(err);
    },
    end(_time: Time) {
      result.ended = true;
    },
  };

  _getSource(event).run(sink as Sink<unknown, never>, scheduler);
  return result;
}

describe("Event constructors", () => {
  describe("empty", () => {
    it("ends immediately without emitting", () => {
      const scheduler = new TestScheduler();
      const result = collect(empty(), scheduler);
      expect(result.values).toEqual([]);
      expect(result.ended).toBe(true);
    });
  });

  describe("never", () => {
    it("never emits and never ends", () => {
      const scheduler = new TestScheduler();
      const result = collect(never(), scheduler);
      expect(result.values).toEqual([]);
      expect(result.ended).toBe(false);
    });
  });

  describe("now", () => {
    it("emits one value at current time, then ends", () => {
      const scheduler = new TestScheduler();
      const result = collect<number>(now(42), scheduler);
      expect(result.values).toEqual([[toTime(0), 42]]);
      expect(result.ended).toBe(true);
    });
  });

  describe("at", () => {
    it("emits one value at the specified time", () => {
      const scheduler = new TestScheduler();
      const values: [Time, string][] = [];
      let ended = false;

      _getSource(at(toTime(100), "hello")).run(
        {
          event(time: Time, value: string) {
            values.push([time, value]);
          },
          error() {},
          end() {
            ended = true;
          },
        },
        scheduler,
      );

      expect(values).toEqual([]);
      scheduler.advanceTo(toTime(100));
      expect(values).toEqual([[toTime(100), "hello"]]);
      expect(ended).toBe(true);
    });
  });

  describe("fromArray", () => {
    it("emits all values synchronously, then ends", () => {
      const scheduler = new TestScheduler();
      const result = collect<number>(fromArray([1, 2, 3]), scheduler);
      expect(result.values).toEqual([
        [toTime(0), 1],
        [toTime(0), 2],
        [toTime(0), 3],
      ]);
      expect(result.ended).toBe(true);
    });

    it("handles empty array", () => {
      const scheduler = new TestScheduler();
      const result = collect(fromArray([]), scheduler);
      expect(result.values).toEqual([]);
      expect(result.ended).toBe(true);
    });
  });

  describe("fromIterable", () => {
    it("emits all values from a Set", () => {
      const scheduler = new TestScheduler();
      const result = collect<number>(fromIterable(new Set([1, 2, 3])), scheduler);
      expect(result.values.map(([_, v]) => v)).toEqual([1, 2, 3]);
      expect(result.ended).toBe(true);
    });
  });

  describe("periodic", () => {
    it("emits at regular intervals", () => {
      const scheduler = new TestScheduler();
      const values: Time[] = [];

      const disposable = _getSource(periodic(toDuration(50))).run(
        {
          event(time: Time) {
            values.push(time);
          },
          error() {},
          end() {},
        },
        scheduler,
      );

      scheduler.advanceTo(toTime(150));
      expect(values).toEqual([toTime(50), toTime(100), toTime(150)]);
      disposable.dispose();
    });

    it("stops emitting after disposal", () => {
      const scheduler = new TestScheduler();
      const values: Time[] = [];

      const disposable = _getSource(periodic(toDuration(50))).run(
        {
          event(time: Time) {
            values.push(time);
          },
          error() {},
          end() {},
        },
        scheduler,
      );

      scheduler.advanceTo(toTime(100));
      disposable.dispose();
      scheduler.advanceTo(toTime(200));
      expect(values).toEqual([toTime(50), toTime(100)]);
    });
  });
});
