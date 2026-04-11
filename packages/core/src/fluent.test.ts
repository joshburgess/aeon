import { type Time, toTime } from "@pulse/types";
import { VirtualScheduler } from "@pulse/scheduler";
import { describe, expect, it } from "vitest";
import { fluent, FluentEvent } from "./fluent.js";
import { constantB } from "./behavior.js";
import { fromArray, now, empty } from "./constructors.js";
import { _getSource } from "./internal/event.js";

describe("fluent API", () => {
  it("wraps an event and exposes .event", () => {
    const event = fromArray([1, 2, 3]);
    const f = fluent(event);
    expect(f).toBeInstanceOf(FluentEvent);
    expect(f.event).toBe(event);
  });

  it("chains map, filter, take", async () => {
    const scheduler = new VirtualScheduler();
    const result = await fluent(fromArray([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))
      .filter((x: number) => x % 2 === 0)
      .map((x: number) => x * 10)
      .take(3)
      .reduce((acc: number, x: number) => acc + x, 0, scheduler);

    // Even numbers: 2,4,6,8,10 → ×10 → 20,40,60,80,100 → take(3) → 20,40,60
    expect(result).toBe(120);
  });

  it("chains scan and observe", async () => {
    const scheduler = new VirtualScheduler();
    const values: number[] = [];
    await fluent(fromArray([1, 2, 3]))
      .scan((acc: number, x: number) => acc + x, 0)
      .observe((v: number) => values.push(v), scheduler);

    expect(values).toEqual([1, 3, 6]);
  });

  it("chains tap without altering values", async () => {
    const scheduler = new VirtualScheduler();
    const sideEffects: number[] = [];
    const result = await fluent(fromArray([1, 2, 3]))
      .tap((x: number) => sideEffects.push(x))
      .reduce((acc: number, x: number) => acc + x, 0, scheduler);

    expect(result).toBe(6);
    expect(sideEffects).toEqual([1, 2, 3]);
  });

  it("chains constant", async () => {
    const scheduler = new VirtualScheduler();
    const result = await fluent(fromArray([1, 2, 3]))
      .constant(42)
      .reduce((acc: number, x: number) => acc + x, 0, scheduler);

    expect(result).toBe(126); // 42 * 3
  });

  it("chains skip and skipWhile", async () => {
    const scheduler = new VirtualScheduler();
    const r1 = await fluent(fromArray([1, 2, 3, 4, 5]))
      .skip(2)
      .reduce((acc: number, x: number) => acc + x, 0, scheduler);
    expect(r1).toBe(12); // 3+4+5

    const r2 = await fluent(fromArray([1, 2, 3, 4, 5]))
      .skipWhile((x: number) => x < 3)
      .reduce((acc: number, x: number) => acc + x, 0, scheduler);
    expect(r2).toBe(12); // 3+4+5
  });

  it("chains takeWhile", async () => {
    const scheduler = new VirtualScheduler();
    const result = await fluent(fromArray([1, 2, 3, 4, 5]))
      .takeWhile((x: number) => x < 4)
      .reduce((acc: number, x: number) => acc + x, 0, scheduler);
    expect(result).toBe(6); // 1+2+3
  });

  it("chains slice", async () => {
    const scheduler = new VirtualScheduler();
    const result = await fluent(fromArray([1, 2, 3, 4, 5]))
      .slice(1, 4)
      .reduce((acc: number, x: number) => acc + x, 0, scheduler);
    expect(result).toBe(9); // 2+3+4
  });

  it("chains merge", async () => {
    const scheduler = new VirtualScheduler();
    const result = await fluent(fromArray([1, 2]))
      .merge(fromArray([3, 4]))
      .reduce((acc: number, x: number) => acc + x, 0, scheduler);
    expect(result).toBe(10);
  });

  it("chains zip", async () => {
    const scheduler = new VirtualScheduler();
    const values: [number, string][] = [];
    await fluent(fromArray([1, 2, 3]))
      .zip(fromArray(["a", "b", "c"]))
      .observe((v: [number, string]) => values.push(v), scheduler);
    expect(values).toEqual([[1, "a"], [2, "b"], [3, "c"]]);
  });

  it("chains sample from behavior", async () => {
    const scheduler = new VirtualScheduler();
    const b = constantB(99);
    const result = await fluent(fromArray([1, 2, 3]))
      .sample(b)
      .reduce((acc: number, x: number) => acc + x, 0, scheduler);
    expect(result).toBe(297); // 99 * 3
  });

  it("drain resolves when stream ends", async () => {
    const scheduler = new VirtualScheduler();
    await fluent(fromArray([1, 2, 3])).drain(scheduler);
    // If it resolves without error, the test passes
  });

  it("chains error handling", async () => {
    const scheduler = new VirtualScheduler();
    const result = await fluent(fromArray([1, 2, 3]))
      .map((x: number) => x * 2)
      .mapError((e: never) => e)
      .reduce((acc: number, x: number) => acc + x, 0, scheduler);
    expect(result).toBe(12);
  });
});
