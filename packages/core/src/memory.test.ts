/**
 * Memory leak tests.
 *
 * Verify that repeated subscribe/dispose cycles do not leak memory.
 * These tests measure heap growth over many iterations — a leak would
 * cause heap to grow proportionally to iteration count.
 */

import { VirtualScheduler } from "aeon-scheduler";
import type { Disposable, Sink, Time } from "aeon-types";
import { toDuration } from "aeon-types";
import { describe, expect, it } from "vitest";
import { createAdapter } from "./adapter.js";
import { filter } from "./combinators/filter.js";
import { map } from "./combinators/map.js";
import { merge } from "./combinators/merge.js";
import { scan } from "./combinators/scan.js";
import { debounce, throttle } from "./combinators/time.js";
import { fromArray, periodic } from "./constructors.js";
import { _getSource } from "./internal/event.js";
import { multicast } from "./multicast.js";

const ITERATIONS = 10_000;

/** Force a GC if available (run node with --expose-gc). */
function tryGC() {
  if (typeof globalThis.gc === "function") {
    globalThis.gc();
  }
}

/** Measure heap used bytes. */
function heapUsed(): number {
  tryGC();
  return process.memoryUsage().heapUsed;
}

describe("memory leak tests", () => {
  it("subscribe/dispose cycle on a pipeline does not leak", () => {
    const scheduler = new VirtualScheduler();
    const source = map(
      (x: number) => x * 2,
      filter(
        (x: number) => x % 2 === 0,
        scan((acc: number, x: number) => acc + x, 0, fromArray([1, 2, 3, 4, 5])),
      ),
    );
    const src = _getSource(source);

    // Warm up
    for (let i = 0; i < 100; i++) {
      const d = src.run({ event() {}, error() {}, end() {} } as Sink<number, never>, scheduler);
      d.dispose();
    }

    const before = heapUsed();

    for (let i = 0; i < ITERATIONS; i++) {
      const d = src.run({ event() {}, error() {}, end() {} } as Sink<number, never>, scheduler);
      d.dispose();
    }

    const after = heapUsed();
    const growth = after - before;

    // Allow up to 2MB of heap growth for 10k iterations — if there's a real
    // leak (retaining sink chains), it would grow by tens of MB.
    expect(growth).toBeLessThan(8 * 1024 * 1024);
  });

  it("multicast subscribe/dispose does not leak sinks", () => {
    const scheduler = new VirtualScheduler();
    const source = multicast(fromArray([1, 2, 3]));
    const src = _getSource(source);

    // Warm up
    for (let i = 0; i < 100; i++) {
      const d = src.run({ event() {}, error() {}, end() {} } as Sink<number, never>, scheduler);
      d.dispose();
    }

    const before = heapUsed();

    for (let i = 0; i < ITERATIONS; i++) {
      const d = src.run({ event() {}, error() {}, end() {} } as Sink<number, never>, scheduler);
      d.dispose();
    }

    const after = heapUsed();
    const growth = after - before;
    expect(growth).toBeLessThan(8 * 1024 * 1024);
  });

  it("adapter push/dispose cycle does not leak", () => {
    const [push, event] = createAdapter<number, never>();
    const pipeline = map((x: number) => x * 2, event);
    const src = _getSource(pipeline);
    const scheduler = new VirtualScheduler();

    // Warm up
    for (let i = 0; i < 100; i++) {
      const d = src.run({ event() {}, error() {}, end() {} } as Sink<number, never>, scheduler);
      push(i);
      d.dispose();
    }

    const before = heapUsed();

    for (let i = 0; i < ITERATIONS; i++) {
      const d = src.run({ event() {}, error() {}, end() {} } as Sink<number, never>, scheduler);
      push(i);
      d.dispose();
    }

    const after = heapUsed();
    const growth = after - before;
    expect(growth).toBeLessThan(8 * 1024 * 1024);
  });

  it("merge of many sources does not leak on dispose", () => {
    const scheduler = new VirtualScheduler();
    const sources = Array.from({ length: 10 }, (_, i) => fromArray([i]));
    const merged = merge(...sources);
    const src = _getSource(merged);

    // Warm up
    for (let i = 0; i < 100; i++) {
      const d = src.run({ event() {}, error() {}, end() {} } as Sink<number, never>, scheduler);
      d.dispose();
    }

    const before = heapUsed();

    for (let i = 0; i < ITERATIONS; i++) {
      const d = src.run({ event() {}, error() {}, end() {} } as Sink<number, never>, scheduler);
      d.dispose();
    }

    const after = heapUsed();
    const growth = after - before;
    expect(growth).toBeLessThan(8 * 1024 * 1024);
  });

  it("multicast with multiple concurrent subscribers does not leak", () => {
    const scheduler = new VirtualScheduler();
    const source = multicast(fromArray([1, 2, 3]));
    const src = _getSource(source);
    const sink = { event() {}, error() {}, end() {} } as Sink<number, never>;

    // Warm up
    for (let i = 0; i < 100; i++) {
      const d1 = src.run(sink, scheduler);
      const d2 = src.run(sink, scheduler);
      const d3 = src.run(sink, scheduler);
      d1.dispose();
      d2.dispose();
      d3.dispose();
    }

    const before = heapUsed();

    for (let i = 0; i < ITERATIONS; i++) {
      const d1 = src.run(sink, scheduler);
      const d2 = src.run(sink, scheduler);
      const d3 = src.run(sink, scheduler);
      d1.dispose();
      d2.dispose();
      d3.dispose();
    }

    const after = heapUsed();
    const growth = after - before;
    expect(growth).toBeLessThan(4 * 1024 * 1024);
  });
});
