/**
 * Benchmark: zip of two 100k-element streams.
 *
 * Tests the pairwise buffering and emission overhead.
 * (Reduced from 1M because zip buffering is O(n) with array shift.)
 */

import { bench, describe } from "vitest";

// --- Pulse ---
import { drain, fromArray, zip } from "@pulse/core";
import { VirtualScheduler } from "@pulse/scheduler";

// --- @most/core ---
import { zip as mostZip, runEffects } from "@most/core";
import { newStream } from "@most/core";
import { newDefaultScheduler } from "@most/scheduler";
import type { Stream } from "@most/types";

// --- RxJS ---
import { lastValueFrom, from as rxFrom, zip as rxZip } from "rxjs";

// --- Helpers ---
import { add, range } from "./helpers.js";

const N = 10_000;
const arr1 = range(N);
const arr2 = range(N);

const mostFromArray = <A>(values: readonly A[]): Stream<A> =>
  newStream((sink, scheduler) => {
    const t = scheduler.currentTime();
    for (let i = 0; i < values.length; i++) {
      sink.event(t, values[i]!);
    }
    sink.end(t);
    return { dispose() {} };
  });

describe("zip (2 × 10k streams)", () => {
  bench("pulse", async () => {
    const scheduler = new VirtualScheduler();
    await drain(zip(fromArray(arr1), fromArray(arr2)), scheduler);
  });

  bench("@most/core", async () => {
    const scheduler = newDefaultScheduler();
    await runEffects(mostZip(add, mostFromArray(arr1), mostFromArray(arr2)), scheduler);
  });

  bench("rxjs", async () => {
    await lastValueFrom(rxZip(rxFrom(arr1), rxFrom(arr2)), { defaultValue: undefined });
  });
});
