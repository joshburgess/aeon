/**
 * Async/push event benchmarks.
 *
 * Tests real-world patterns where the Sink protocol handles dispatch:
 * - Imperative push through pipelines (simulates DOM events, WS messages)
 * - Multicast fan-out to multiple subscribers
 * - Higher-order stream management (subscription creation/disposal)
 * - Deep pipeline per-event overhead scaling
 *
 * These complement the sync benchmarks by measuring per-event dispatch
 * cost through the Sink protocol, not sync loop compilation throughput.
 */

import { bench, describe } from "vitest";

// --- Pulse ---
import {
  type Disposable,
  type Event,
  type Sink,
  type Source,
  type Time,
  createAdapter,
  drain,
  filter,
  fromArray,
  map,
  merge,
  mergeMapConcurrently,
  multicast,
  scan,
  share,
  switchLatest,
  take,
} from "@pulse/core";
import { VirtualScheduler } from "@pulse/scheduler";

// --- RxJS ---
import {
  Subject,
  mergeMap,
  filter as rxFilter,
  from as rxFrom,
  map as rxMap,
  merge as rxMerge,
  scan as rxScan,
  share as rxShare,
  take as rxTake,
  switchAll,
} from "rxjs";

// --- Helpers ---
import { add, double, isEven, range } from "./helpers.js";

const N = 100_000;
const arr = range(N);

/**
 * Subscribe to a Pulse Event with an inline observer.
 * Uses the same pattern as observe() but returns a disposable.
 */
const subscribe = <A, E>(
  event: Event<A, E>,
  onEvent: (v: A) => void,
  scheduler: InstanceType<typeof VirtualScheduler>,
): Disposable => {
  const source = event as unknown as Source<A, E>;
  return source.run(
    {
      event(_t: Time, v: A) {
        onEvent(v);
      },
      error() {},
      end() {},
    },
    scheduler,
  );
};

// ============================================================
// 1. Imperative push through a pipeline
// Simulates: events arriving one-at-a-time (DOM clicks, WS messages)
// ============================================================

describe("imperative push: filter → map → scan (100k events)", () => {
  bench("pulse", () => {
    const scheduler = new VirtualScheduler();
    const [push, event] = createAdapter<number>();
    const pipeline = scan(add, 0, map(double, filter(isEven, event)));

    let last = 0;
    const d = subscribe(
      pipeline,
      (v) => {
        last = v;
      },
      scheduler,
    );

    for (let i = 0; i < N; i++) {
      push(i);
    }
    d.dispose();
    return last;
  });

  bench("rxjs", () => {
    const subject = new Subject<number>();
    const pipeline = subject.pipe(rxFilter(isEven), rxMap(double), rxScan(add, 0));

    let last = 0;
    const sub = pipeline.subscribe((v) => {
      last = v;
    });

    for (let i = 0; i < N; i++) {
      subject.next(i);
    }
    sub.unsubscribe();
    return last;
  });
});

// ============================================================
// 2. Multicast fan-out: one source, multiple subscribers
// ============================================================

describe("multicast fan-out: 1 source → 10 subscribers (100k events)", () => {
  bench("pulse", () => {
    const scheduler = new VirtualScheduler();
    const [push, event] = createAdapter<number>();
    const shared = multicast(map(double, event));

    let total = 0;
    const disposables: Disposable[] = [];
    for (let s = 0; s < 10; s++) {
      disposables.push(
        subscribe(
          shared,
          (v) => {
            total += v;
          },
          scheduler,
        ),
      );
    }

    for (let i = 0; i < N; i++) {
      push(i);
    }
    for (const d of disposables) d.dispose();
    return total;
  });

  bench("rxjs", () => {
    const subject = new Subject<number>();
    const shared = subject.pipe(rxMap(double), rxShare());

    let total = 0;
    const subs = [];
    for (let s = 0; s < 10; s++) {
      subs.push(
        shared.subscribe((v) => {
          total += v;
        }),
      );
    }

    for (let i = 0; i < N; i++) {
      subject.next(i);
    }
    for (const s of subs) s.unsubscribe();
    return total;
  });
});

// ============================================================
// 3. Higher-order: mergeMap with sync inner streams
// Tests subscription creation/disposal overhead
// ============================================================

describe("mergeMap: 1k outer × 100 inner (100k total events)", () => {
  const outer = range(1000);
  const innerArr = range(100);

  bench("pulse", async () => {
    const scheduler = new VirtualScheduler();
    await drain(
      mergeMapConcurrently(() => fromArray(innerArr), Number.POSITIVE_INFINITY, fromArray(outer)),
      scheduler,
    );
  });

  bench("rxjs", async () => {
    const { lastValueFrom } = await import("rxjs");
    await new Promise<void>((resolve) => {
      rxFrom(outer)
        .pipe(mergeMap(() => rxFrom(innerArr)))
        .subscribe({
          complete() {
            resolve();
          },
        });
    });
  });
});

// ============================================================
// 4. switchLatest: rapidly switching inner streams
// Tests disposal + resubscription overhead
// ============================================================

describe("switchLatest: 100 switches × 1k inner events", () => {
  const outerCount = 100;
  const innerArr = range(1000);

  bench("pulse", async () => {
    const scheduler = new VirtualScheduler();
    const outers: Event<number, never>[] = [];
    for (let i = 0; i < outerCount; i++) {
      outers.push(fromArray(innerArr));
    }
    await drain(switchLatest(fromArray(outers)), scheduler);
  });

  bench("rxjs", async () => {
    const outers = [];
    for (let i = 0; i < outerCount; i++) {
      outers.push(rxFrom(innerArr));
    }
    await new Promise<void>((resolve) => {
      rxFrom(outers)
        .pipe(switchAll())
        .subscribe({
          complete() {
            resolve();
          },
        });
    });
  });
});

// ============================================================
// 5. Deep pipeline: 10 chained maps (per-event overhead scaling)
// ============================================================

describe("deep pipeline: 10 chained maps (100k push events)", () => {
  bench("pulse", () => {
    const scheduler = new VirtualScheduler();
    const [push, event] = createAdapter<number>();
    let pipeline: Event<number, never> = event;
    for (let i = 0; i < 10; i++) {
      pipeline = map((x: number) => x + 1, pipeline);
    }

    let last = 0;
    const d = subscribe(
      pipeline,
      (v) => {
        last = v;
      },
      scheduler,
    );

    for (let i = 0; i < N; i++) {
      push(i);
    }
    d.dispose();
    return last;
  });

  bench("rxjs", () => {
    const subject = new Subject<number>();
    let pipeline = subject.asObservable();
    for (let i = 0; i < 10; i++) {
      pipeline = pipeline.pipe(rxMap((x: number) => x + 1));
    }

    let last = 0;
    const sub = pipeline.subscribe((v) => {
      last = v;
    });

    for (let i = 0; i < N; i++) {
      subject.next(i);
    }
    sub.unsubscribe();
    return last;
  });
});

// ============================================================
// 6. take(100) from imperative push (early termination)
// ============================================================

describe("take(100) from imperative push (10k pushed)", () => {
  bench("pulse", () => {
    const scheduler = new VirtualScheduler();
    const [push, event] = createAdapter<number>();
    const pipeline = take(100, event);

    let count = 0;
    subscribe(
      pipeline,
      () => {
        count++;
      },
      scheduler,
    );

    for (let i = 0; i < 10_000; i++) {
      push(i);
    }
    return count;
  });

  bench("rxjs", () => {
    const subject = new Subject<number>();
    const pipeline = subject.pipe(rxTake(100));

    let count = 0;
    pipeline.subscribe(() => {
      count++;
    });

    for (let i = 0; i < 10_000; i++) {
      subject.next(i);
    }
    return count;
  });
});

// ============================================================
// 7. Merge of pushed streams
// ============================================================

describe("merge 5 push sources (20k events each, 100k total)", () => {
  bench("pulse", () => {
    const scheduler = new VirtualScheduler();
    const adapters = Array.from({ length: 5 }, () => createAdapter<number>());
    const merged = merge(...adapters.map(([, e]) => e));

    let count = 0;
    const d = subscribe(
      merged,
      () => {
        count++;
      },
      scheduler,
    );

    for (let i = 0; i < 20_000; i++) {
      for (const [push] of adapters) {
        push(i);
      }
    }
    d.dispose();
    return count;
  });

  bench("rxjs", () => {
    const subjects = Array.from({ length: 5 }, () => new Subject<number>());
    const merged = rxMerge(...subjects);

    let count = 0;
    const sub = merged.subscribe(() => {
      count++;
    });

    for (let i = 0; i < 20_000; i++) {
      for (const s of subjects) {
        s.next(i);
      }
    }
    sub.unsubscribe();
    return count;
  });
});
