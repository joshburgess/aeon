/**
 * Benchmark: scan over 1M integers.
 *
 * Tests running accumulation performance — every element flows
 * through the scan function and produces output.
 */

import { bench, describe } from "vitest";

// --- Pulse ---
import { drain, fromArray, scan } from "aeon-core";
import { VirtualScheduler } from "aeon-scheduler";

// --- @most/core ---
import { scan as mostScan, runEffects } from "@most/core";
import { newStream } from "@most/core";
import { newDefaultScheduler } from "@most/scheduler";
import type { Stream } from "@most/types";

// --- RxJS ---
import { last, lastValueFrom, from as rxFrom, scan as rxScan } from "rxjs";

// --- Helpers ---
import { add, range } from "./helpers.js";

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

describe("scan (1M integers)", () => {
  bench("pulse", async () => {
    const scheduler = new VirtualScheduler();
    await drain(scan(add, 0, fromArray(arr)), scheduler);
  });

  bench("@most/core", async () => {
    const scheduler = newDefaultScheduler();
    await runEffects(mostScan(add, 0, mostFromArray(arr)), scheduler);
  });

  bench("rxjs", async () => {
    await lastValueFrom(rxFrom(arr).pipe(rxScan(add, 0), last()));
  });
});
