/**
 * Benchmark: switchLatest — 1000 outer events, each with 100 inner elements.
 *
 * Tests the overhead of disposing inner subscriptions and
 * switching to new streams.
 */

import { bench, describe } from "vitest";

// --- Pulse ---
import { fromArray, switchLatest, drain, map } from "@pulse/core";
import { VirtualScheduler } from "@pulse/scheduler";

// --- @most/core ---
import {
  switchLatest as mostSwitchLatest,
  map as mostMap,
  runEffects,
} from "@most/core";
import { newDefaultScheduler } from "@most/scheduler";
import type { Stream } from "@most/types";
import { newStream } from "@most/core";

// --- RxJS ---
import { from as rxFrom, switchMap, lastValueFrom } from "rxjs";

// --- Helpers ---
import { range } from "./helpers.js";

const OUTER = 1000;
const INNER = 100;
const outerArr = range(OUTER);
const innerArr = range(INNER);

const mostFromArray = <A>(values: readonly A[]): Stream<A> =>
  newStream((sink, scheduler) => {
    const t = scheduler.currentTime();
    for (let i = 0; i < values.length; i++) {
      sink.event(t, values[i]!);
    }
    sink.end(t);
    return { dispose() {} };
  });

describe("switchLatest (1000 outer × 100 inner)", () => {
  bench("pulse", async () => {
    const scheduler = new VirtualScheduler();
    await drain(
      switchLatest(map(() => fromArray(innerArr), fromArray(outerArr))),
      scheduler,
    );
  });

  bench("@most/core", async () => {
    const scheduler = newDefaultScheduler();
    await runEffects(
      mostSwitchLatest(mostMap(() => mostFromArray(innerArr), mostFromArray(outerArr))),
      scheduler,
    );
  });

  bench("rxjs", async () => {
    await lastValueFrom(
      rxFrom(outerArr).pipe(switchMap(() => rxFrom(innerArr))),
      { defaultValue: undefined },
    );
  });
});
