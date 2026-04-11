/**
 * Benchmark: take + skip (slice) over 1M integers.
 *
 * Tests early termination and skip overhead.
 */

import { bench, describe } from "vitest";

// --- Pulse ---
import { fromArray, take, skip, drain } from "@pulse/core";
import { VirtualScheduler } from "@pulse/scheduler";

// --- @most/core ---
import { take as mostTake, skip as mostSkip, runEffects } from "@most/core";
import { newDefaultScheduler } from "@most/scheduler";
import type { Stream } from "@most/types";
import { newStream } from "@most/core";

// --- RxJS ---
import { from as rxFrom, take as rxTake, skip as rxSkip, lastValueFrom } from "rxjs";

// --- Helpers ---
import { range } from "./helpers.js";

const N = 1_000_000;
const arr = range(N);

const mostFromArray = <A>(values: readonly A[]): Stream<A> =>
  newStream((sink, scheduler) => {
    const t = scheduler.currentTime();
    for (let i = 0; i < values.length; i++) {
      sink.event(t, values[i]!);
    }
    sink.end(t);
    return { dispose() {} };
  });

describe("take(100) from 1M", () => {
  bench("pulse", async () => {
    const scheduler = new VirtualScheduler();
    await drain(take(100, fromArray(arr)), scheduler);
  });

  bench("@most/core", async () => {
    const scheduler = newDefaultScheduler();
    await runEffects(mostTake(100, mostFromArray(arr)), scheduler);
  });

  bench("rxjs", async () => {
    await lastValueFrom(rxFrom(arr).pipe(rxTake(100)), { defaultValue: undefined });
  });
});

describe("skip(999_900) from 1M (take last 100)", () => {
  bench("pulse", async () => {
    const scheduler = new VirtualScheduler();
    await drain(skip(999_900, fromArray(arr)), scheduler);
  });

  bench("@most/core", async () => {
    const scheduler = newDefaultScheduler();
    await runEffects(mostSkip(999_900, mostFromArray(arr)), scheduler);
  });

  bench("rxjs", async () => {
    await lastValueFrom(rxFrom(arr).pipe(rxSkip(999_900)), { defaultValue: undefined });
  });
});
