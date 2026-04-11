/**
 * Benchmark: filter → map → reduce over 1M integers.
 *
 * The canonical stream library benchmark. Tests the hot path of
 * synchronous event propagation through a typical pipeline.
 */

import { bench, describe } from "vitest";

// --- Pulse ---
import { fromArray, filter, map, reduce, drain, scan } from "@pulse/core";
import { VirtualScheduler } from "@pulse/scheduler";

// --- @most/core ---
import {
  map as mostMap,
  filter as mostFilter,
  scan as mostScan,
  runEffects,
} from "@most/core";
import { newDefaultScheduler } from "@most/scheduler";

// --- RxJS ---
import { from as rxFrom, filter as rxFilter, map as rxMap, reduce as rxReduce, lastValueFrom } from "rxjs";

// --- Helpers ---
import { add, double, isEven, range } from "./helpers.js";

const N = 1_000_000;
const arr = range(N);

describe("filter → map → reduce (1M integers)", () => {
  bench("pulse", async () => {
    const scheduler = new VirtualScheduler();
    await reduce(
      add,
      0,
      map(double, filter(isEven, fromArray(arr))),
      scheduler,
    );
  });

  bench("@most/core", async () => {
    const scheduler = newDefaultScheduler();
    await runEffects(
      mostScan(add, 0, mostMap(double, mostFilter(isEven, mostFromArray(arr)))),
      scheduler,
    );
  });

  bench("rxjs", async () => {
    await lastValueFrom(
      rxFrom(arr).pipe(
        rxFilter(isEven),
        rxMap(double),
        rxReduce(add, 0),
      ),
    );
  });

  bench("native array", () => {
    arr.filter(isEven).map(double).reduce(add, 0);
  });
});

// --- @most/core fromArray helper (inline to avoid import issues) ---
import type { Stream } from "@most/types";
import { newStream } from "@most/core";

const mostFromArray = <A>(values: readonly A[]): Stream<A> =>
  newStream((sink, scheduler) => {
    const t = scheduler.currentTime();
    for (let i = 0; i < values.length; i++) {
      sink.event(t, values[i]!);
    }
    sink.end(t);
    return { dispose() {} };
  });
