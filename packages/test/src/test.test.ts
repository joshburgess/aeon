import { toDuration, toTime } from "@pulse/types";
import { VirtualScheduler } from "@pulse/scheduler";
import { fromArray, map, filter, take, merge } from "@pulse/core";
import { describe, expect, it } from "vitest";
import { parseMarble, marbleDuration } from "./marble.js";
import { testEvent } from "./testEvent.js";
import { collectEvents, collectSync } from "./collect.js";
import { assertEvents } from "./assert.js";

describe("parseMarble", () => {
  it("parses simple marble string", () => {
    // "--a--b--|" is 9 chars: a at t=2, b at t=5, end at t=8
    const entries = parseMarble("--a--b--|", { a: 1, b: 2 });
    expect(entries).toEqual([
      { type: "event", time: toTime(2), value: 1 },
      { type: "event", time: toTime(5), value: 2 },
      { type: "end", time: toTime(8) },
    ]);
  });

  it("parses grouped events (same time)", () => {
    // "--(ab)-|" : ( at t=2, a at t=2, b at t=2, ) advances to t=3, - to t=4, | at t=4
    const entries = parseMarble("--(ab)-|", { a: 1, b: 2 });
    expect(entries).toEqual([
      { type: "event", time: toTime(2), value: 1 },
      { type: "event", time: toTime(2), value: 2 },
      { type: "end", time: toTime(4) },
    ]);
  });

  it("parses error marker", () => {
    const entries = parseMarble("--a--#", { a: 1 }, "boom");
    expect(entries).toEqual([
      { type: "event", time: toTime(2), value: 1 },
      { type: "error", time: toTime(5), error: "boom" },
    ]);
  });

  it("respects custom time unit", () => {
    // "--a-|" : -(10), -(20), a(emit at 20, advance to 30), -(40), |(emit at 40)
    const entries = parseMarble("--a-|", { a: 1 }, undefined, 10);
    expect(entries).toEqual([
      { type: "event", time: toTime(20), value: 1 },
      { type: "end", time: toTime(40) },
    ]);
  });

  it("throws on unknown marble character", () => {
    expect(() => parseMarble("--x--|", { a: 1 })).toThrow("Marble character 'x' not found");
  });
});

describe("marbleDuration", () => {
  it("computes duration of simple marble", () => {
    // "--a--b--|" is 9 chars, each 1 unit = 9
    expect(marbleDuration("--a--b--|")).toBe(9);
  });

  it("counts groups as one time unit", () => {
    // "--(ab)-|" : 2 dashes + 1 group + 1 dash + 1 pipe = 5 time units
    expect(marbleDuration("--(ab)-|")).toBe(5);
  });

  it("respects custom time unit", () => {
    // "--a--|" is 5 chars, each 10 units = 50
    // Wait: 5 chars × 10 = 50. Let me count: -, -, a, -, -, | = 6 chars × 10 = 60
    expect(marbleDuration("--a--|", 10)).toBe(60);
  });
});

describe("testEvent", () => {
  it("emits values at correct times", () => {
    const scheduler = new VirtualScheduler();
    const event = testEvent("--a--b--|", { a: 10, b: 20 });
    const result = collectEvents(event, scheduler);

    expect(result.values).toEqual([]);

    scheduler.advanceTo(toTime(2));
    expect(result.values).toEqual([10]);

    scheduler.advanceTo(toTime(5));
    expect(result.values).toEqual([10, 20]);

    scheduler.advanceTo(toTime(8));
    expect(result.values).toEqual([10, 20]);
    expect(result.ended).toBe(true);

    result.disposable.dispose();
  });

  it("emits grouped events at the same time", () => {
    const scheduler = new VirtualScheduler();
    const event = testEvent("--(ab)--|", { a: 1, b: 2 });
    const result = collectEvents(event, scheduler);

    scheduler.advanceTo(toTime(2));
    expect(result.values).toEqual([1, 2]);

    result.disposable.dispose();
  });

  it("emits error at correct time", () => {
    const scheduler = new VirtualScheduler();
    const event = testEvent<number, string>("--a--#", { a: 1 }, "fail");
    const result = collectEvents(event, scheduler);

    scheduler.advanceTo(toTime(5));
    expect(result.values).toEqual([1]);
    expect(result.errored).toBe(true);
    expect(result.error).toBe("fail");

    result.disposable.dispose();
  });
});

describe("collectEvents", () => {
  it("collects from synchronous sources", () => {
    const scheduler = new VirtualScheduler();
    const result = collectEvents(fromArray([1, 2, 3]), scheduler);
    expect(result.values).toEqual([1, 2, 3]);
    expect(result.ended).toBe(true);
    result.disposable.dispose();
  });

  it("collects from async sources as scheduler advances", () => {
    const scheduler = new VirtualScheduler();
    const event = testEvent("--a--b--|", { a: "x", b: "y" });
    const result = collectEvents(event, scheduler);

    expect(result.values).toEqual([]);
    scheduler.flush();
    expect(result.values).toEqual(["x", "y"]);
    expect(result.ended).toBe(true);
    result.disposable.dispose();
  });
});

describe("collectSync", () => {
  it("collects all values from a sync event", () => {
    const scheduler = new VirtualScheduler();
    const values = collectSync(fromArray([10, 20, 30]), scheduler);
    expect(values).toEqual([10, 20, 30]);
  });

  it("works with combinators on sync sources", () => {
    const scheduler = new VirtualScheduler();
    const event = take(2, map((x: number) => x * 10, fromArray([1, 2, 3, 4])));
    const values = collectSync(event, scheduler);
    expect(values).toEqual([10, 20]);
  });
});

describe("assertEvents", () => {
  it("passes when entries match", () => {
    const scheduler = new VirtualScheduler();
    const event = testEvent("--a--b--|", { a: 1, b: 2 });
    const result = collectEvents(event, scheduler);
    scheduler.flush();

    const expected = parseMarble("--a--b--|", { a: 1, b: 2 });
    const check = assertEvents(result.entries, expected);
    expect(check.pass).toBe(true);
  });

  it("fails with message on length mismatch", () => {
    const scheduler = new VirtualScheduler();
    const event = testEvent("--a--|", { a: 1 });
    const result = collectEvents(event, scheduler);
    scheduler.flush();

    const expected = parseMarble("--a--b--|", { a: 1, b: 2 });
    const check = assertEvents(result.entries, expected);
    expect(check.pass).toBe(false);
    if (!check.pass) {
      expect(check.message).toContain("Expected 3 entries, got 2");
    }
  });

  it("fails with message on value mismatch", () => {
    const scheduler = new VirtualScheduler();
    const event = testEvent("--a--|", { a: 1 });
    const result = collectEvents(event, scheduler);
    scheduler.flush();

    const expected = parseMarble("--a--|", { a: 999 });
    const check = assertEvents(result.entries, expected);
    expect(check.pass).toBe(false);
    if (!check.pass) {
      expect(check.message).toContain("expected value 999");
    }
  });

  it("fails with message on time mismatch", () => {
    const scheduler = new VirtualScheduler();
    const event = testEvent("--a--|", { a: 1 });
    const result = collectEvents(event, scheduler);
    scheduler.flush();

    const expected = parseMarble("---a--|", { a: 1 });
    const check = assertEvents(result.entries, expected);
    expect(check.pass).toBe(false);
    if (!check.pass) {
      expect(check.message).toContain("expected time 3");
    }
  });

  it("end-to-end marble test: filter + map", () => {
    const scheduler = new VirtualScheduler();
    const source = testEvent("--a-b-c-d--|", { a: 1, b: 2, c: 3, d: 4 });
    const pipeline = map(
      (x: number) => x * 10,
      filter((x: number) => x % 2 === 0, source),
    );
    const result = collectEvents(pipeline, scheduler);
    scheduler.flush();

    expect(result.values).toEqual([20, 40]);
    expect(result.ended).toBe(true);
  });
});
