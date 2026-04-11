/**
 * Benchmark: merge of 100 streams, each with 10k elements.
 *
 * Tests the merge combinator's overhead when interleaving
 * many synchronous sources.
 */

import { bench, describe } from "vitest";

// --- Pulse ---
import { drain, fromArray, merge } from "@pulse/core";
import { VirtualScheduler } from "@pulse/scheduler";

// --- @most/core ---
import { mergeArray as mostMergeArray, runEffects } from "@most/core";
import { newStream } from "@most/core";
import { newDefaultScheduler } from "@most/scheduler";
import type { Stream } from "@most/types";

// --- RxJS ---
import { lastValueFrom, from as rxFrom, merge as rxMerge } from "rxjs";

// --- Helpers ---
import { range } from "./helpers.js";

const STREAM_COUNT = 100;
const ELEMENTS_PER = 10_000;
const arr = range(ELEMENTS_PER);

const mostFromArray = <A>(values: readonly A[]): Stream<A> =>
  newStream((sink, scheduler) => {
    const t = scheduler.currentTime();
    for (let i = 0; i < values.length; i++) {
      sink.event(t, values[i]!);
    }
    sink.end(t);
    return { dispose() {} };
  });

describe(`merge (${STREAM_COUNT} × ${ELEMENTS_PER} elements)`, () => {
  bench("pulse", async () => {
    const scheduler = new VirtualScheduler();
    const streams = Array.from({ length: STREAM_COUNT }, () => fromArray(arr));
    await drain(merge(...streams), scheduler);
  });

  bench("@most/core", async () => {
    const scheduler = newDefaultScheduler();
    const streams = Array.from({ length: STREAM_COUNT }, () => mostFromArray(arr));
    await runEffects(mostMergeArray(streams), scheduler);
  });

  bench("rxjs", async () => {
    const streams = Array.from({ length: STREAM_COUNT }, () => rxFrom(arr));
    await lastValueFrom(rxMerge(...streams), { defaultValue: undefined });
  });
});
