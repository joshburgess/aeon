import { describe, expect, it } from "vitest";
import {
  DURATION_ZERO,
  OFFSET_ZERO,
  TIME_ZERO,
  timeAdd,
  timeDiff,
  timeShift,
  toDuration,
  toOffset,
  toTime,
} from "./branded.js";

describe("Branded types", () => {
  describe("constructors", () => {
    it("toTime wraps a number", () => {
      const t = toTime(42);
      // At runtime it's still a number
      expect(typeof t).toBe("number");
      expect(t).toBe(42);
    });

    it("toDuration wraps a number", () => {
      const d = toDuration(100);
      expect(typeof d).toBe("number");
      expect(d).toBe(100);
    });

    it("toOffset wraps a number", () => {
      const o = toOffset(-5);
      expect(typeof o).toBe("number");
      expect(o).toBe(-5);
    });
  });

  describe("arithmetic", () => {
    it("timeDiff computes the difference between two Times", () => {
      const a = toTime(100);
      const b = toTime(30);
      const diff = timeDiff(a, b);
      expect(diff).toBe(70);
    });

    it("timeAdd advances a Time by a Duration", () => {
      const t = toTime(50);
      const d = toDuration(25);
      expect(timeAdd(t, d)).toBe(75);
    });

    it("timeShift shifts a Time by an Offset", () => {
      const t = toTime(100);
      const o = toOffset(-30);
      expect(timeShift(t, o)).toBe(70);
    });
  });

  describe("constants", () => {
    it("TIME_ZERO is 0", () => {
      expect(TIME_ZERO).toBe(0);
    });

    it("DURATION_ZERO is 0", () => {
      expect(DURATION_ZERO).toBe(0);
    });

    it("OFFSET_ZERO is 0", () => {
      expect(OFFSET_ZERO).toBe(0);
    });
  });
});
