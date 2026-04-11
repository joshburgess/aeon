/**
 * Profiling benchmarks: isolate where time is spent.
 * Compare minimal overhead paths to find bottlenecks.
 */

import { bench, describe } from "vitest";

import { fromArray, filter, map, reduce, drain } from "@pulse/core";
import { VirtualScheduler } from "@pulse/scheduler";

import {
  map as mostMap,
  filter as mostFilter,
  scan as mostScan,
  runEffects,
} from "@most/core";
import { newDefaultScheduler } from "@most/scheduler";
import type { Stream } from "@most/types";
import { newStream } from "@most/core";

const N = 1_000_000;
const arr = Array.from({ length: N }, (_, i) => i);
const add = (a: number, b: number): number => a + b;
const double = (x: number): number => x * 2;
const isEven = (x: number): boolean => x % 2 === 0;

const mostFromArray = <A>(values: readonly A[]): Stream<A> =>
  newStream((sink, scheduler) => {
    const t = scheduler.currentTime();
    for (let i = 0; i < values.length; i++) {
      sink.event(t, values[i]!);
    }
    sink.end(t);
    return { dispose() {} };
  });

describe("isolate: drain(fromArray(1M)) — raw source speed", () => {
  bench("pulse", async () => {
    const s = new VirtualScheduler();
    await drain(fromArray(arr), s);
  });

  bench("@most/core", async () => {
    const s = newDefaultScheduler();
    await runEffects(mostFromArray(arr), s);
  });
});

describe("isolate: map only (1M)", () => {
  bench("pulse", async () => {
    const s = new VirtualScheduler();
    await drain(map(double, fromArray(arr)), s);
  });

  bench("@most/core", async () => {
    const s = newDefaultScheduler();
    await runEffects(mostMap(double, mostFromArray(arr)), s);
  });
});

describe("isolate: filter only (1M)", () => {
  bench("pulse", async () => {
    const s = new VirtualScheduler();
    await drain(filter(isEven, fromArray(arr)), s);
  });

  bench("@most/core", async () => {
    const s = newDefaultScheduler();
    await runEffects(mostFilter(isEven, mostFromArray(arr)), s);
  });
});

describe("isolate: drain(map(double, fromArray(1M))) — one pipeline stage", () => {
  bench("pulse", async () => {
    const s = new VirtualScheduler();
    await drain(map(double, fromArray(arr)), s);
  });

  bench("@most/core", async () => {
    const s = newDefaultScheduler();
    await runEffects(mostMap(double, mostFromArray(arr)), s);
  });
});

describe("isolate: reduce(add, 0, fromArray(1M)) — terminal sink", () => {
  bench("pulse", async () => {
    const s = new VirtualScheduler();
    await reduce(add, 0, fromArray(arr), s);
  });

  bench("@most/core", async () => {
    const s = newDefaultScheduler();
    // @most uses scan + last for reduce-like behavior
    await runEffects(mostScan(add, 0, mostFromArray(arr)), s);
  });
});

describe("isolate: raw for-loop baseline (no stream library)", () => {
  bench("for-loop filter+map+reduce", () => {
    let acc = 0;
    for (let i = 0; i < N; i++) {
      if (i % 2 === 0) {
        acc += i * 2;
      }
    }
    return acc;
  });

  bench("for-loop with function calls", () => {
    let acc = 0;
    for (let i = 0; i < N; i++) {
      if (isEven(i)) {
        acc = add(acc, double(i));
      }
    }
    return acc;
  });
});
