import { VirtualScheduler } from "aeon-scheduler";
import { type Sink, type Time, toDuration, toTime } from "aeon-types";
import { describe, expect, it } from "vitest";
import { constantB } from "./behavior.js";
import { empty, fromArray, now } from "./constructors.js";
import { FluentEvent, fluent } from "./fluent.js";
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

  it("chains drop and dropWhile", async () => {
    const scheduler = new VirtualScheduler();
    const r1 = await fluent(fromArray([1, 2, 3, 4, 5]))
      .drop(2)
      .reduce((acc: number, x: number) => acc + x, 0, scheduler);
    expect(r1).toBe(12); // 3+4+5

    const r2 = await fluent(fromArray([1, 2, 3, 4, 5]))
      .dropWhile((x: number) => x < 3)
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
    expect(values).toEqual([
      [1, "a"],
      [2, "b"],
      [3, "c"],
    ]);
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

  it("chains dedupe", async () => {
    const scheduler = new VirtualScheduler();
    const values: number[] = [];
    await fluent(fromArray([1, 1, 2, 2, 3, 1]))
      .dedupe()
      .observe((v: number) => values.push(v), scheduler);
    expect(values).toEqual([1, 2, 3, 1]);
  });

  it("chains cons", async () => {
    const scheduler = new VirtualScheduler();
    const values: number[] = [];
    await fluent(fromArray([2, 3]))
      .cons(1)
      .observe((v: number) => values.push(v), scheduler);
    expect(values).toEqual([1, 2, 3]);
  });

  it("chains first", async () => {
    const scheduler = new VirtualScheduler();
    const result = await fluent(fromArray([10, 20, 30]))
      .first()
      .reduce((acc: number, x: number) => acc + x, 0, scheduler);
    expect(result).toBe(10);
  });

  it("chains last", async () => {
    const scheduler = new VirtualScheduler();
    const result = await fluent(fromArray([10, 20, 30]))
      .last()
      .reduce((acc: number, x: number) => acc + x, 0, scheduler);
    expect(result).toBe(30);
  });

  it("chains pairwise", async () => {
    const scheduler = new VirtualScheduler();
    const values: [number, number][] = [];
    await fluent(fromArray([1, 2, 3, 4]))
      .pairwise()
      .observe((v: [number, number]) => values.push(v), scheduler);
    expect(values).toEqual([
      [1, 2],
      [2, 3],
      [3, 4],
    ]);
  });

  it("chains chain", async () => {
    const scheduler = new VirtualScheduler();
    const values: number[] = [];
    await fluent(fromArray([1, 2, 3]))
      .chain((x: number) => fromArray([x, x * 10]))
      .observe((v: number) => values.push(v), scheduler);
    expect(values).toEqual([1, 10, 2, 20, 3, 30]);
  });

  it("chains exhaustMap", async () => {
    const scheduler = new VirtualScheduler();
    const result = await fluent(fromArray([1, 2]))
      .exhaustMap((x: number) => now(x * 100))
      .reduce((acc: number, x: number) => acc + x, 0, scheduler);
    expect(result).toBe(300);
  });

  it("chains orElse on empty stream", async () => {
    const scheduler = new VirtualScheduler();
    const result = await fluent(empty<number, never>())
      .orElse(42)
      .reduce((acc: number, x: number) => acc + x, 0, scheduler);
    expect(result).toBe(42);
  });

  it("chains ensure runs cleanup", async () => {
    const scheduler = new VirtualScheduler();
    let cleaned = false;
    await fluent(fromArray([1, 2, 3]))
      .ensure(() => {
        cleaned = true;
      })
      .drain(scheduler);
    expect(cleaned).toBe(true);
  });

  it("chains count", async () => {
    const scheduler = new VirtualScheduler();
    const result = await fluent(fromArray([1, 2, 3, 4, 5]))
      .count()
      .reduce((acc: number, x: number) => acc + x, 0, scheduler);
    expect(result).toBe(5);
  });

  it("chains all", async () => {
    const scheduler = new VirtualScheduler();
    const values: boolean[] = [];
    await fluent(fromArray([2, 4, 6]))
      .all((x: number) => x % 2 === 0)
      .observe((v: boolean) => values.push(v), scheduler);
    expect(values).toEqual([true]);
  });

  it("chains elementAt", async () => {
    const scheduler = new VirtualScheduler();
    const result = await fluent(fromArray([10, 20, 30, 40]))
      .elementAt(2)
      .reduce((acc: number, x: number) => acc + x, 0, scheduler);
    expect(result).toBe(30);
  });

  it("chains race", async () => {
    const scheduler = new VirtualScheduler();
    const result = await fluent(fromArray([1, 2, 3]))
      .race(fromArray([10, 20, 30]))
      .reduce((acc: number, x: number) => acc + x, 0, scheduler);
    // Both emit at t=0; first source to emit wins
    expect(result).toBeGreaterThan(0);
  });

  it("chains timeout with sync events", async () => {
    const scheduler = new VirtualScheduler();
    const result = await fluent(fromArray([1, 2, 3]))
      .timeout(toDuration(1000))
      .reduce((acc: number, x: number) => acc + x, 0, scheduler);
    expect(result).toBe(6);
  });

  it("chains retry with no errors", async () => {
    const scheduler = new VirtualScheduler();
    const result = await fluent(fromArray([1, 2, 3]))
      .retry(3)
      .reduce((acc: number, x: number) => acc + x, 0, scheduler);
    expect(result).toBe(6);
  });

  it("chains share", async () => {
    const scheduler = new VirtualScheduler();
    const result = await fluent(fromArray([1, 2, 3]))
      .share(1)
      .reduce((acc: number, x: number) => acc + x, 0, scheduler);
    expect(result).toBe(6);
  });
});
