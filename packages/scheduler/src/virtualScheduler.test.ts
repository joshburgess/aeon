import { type Time, toDuration, toTime } from "@pulse/types";
import { describe, expect, it } from "vitest";
import { VirtualScheduler } from "./virtualScheduler.js";

describe("VirtualScheduler", () => {
  it("starts at time zero by default", () => {
    const s = new VirtualScheduler();
    expect(s.currentTime()).toBe(toTime(0));
  });

  it("starts at specified initial time", () => {
    const s = new VirtualScheduler(toTime(1000));
    expect(s.currentTime()).toBe(toTime(1000));
  });

  it("scheduleTask and advanceTo executes at correct time", () => {
    const s = new VirtualScheduler();
    const log: [Time, string][] = [];

    s.scheduleTask(toDuration(100), {
      run(t: Time) {
        log.push([t, "a"]);
      },
      error() {},
      dispose() {},
    });

    s.scheduleTask(toDuration(50), {
      run(t: Time) {
        log.push([t, "b"]);
      },
      error() {},
      dispose() {},
    });

    s.scheduleTask(toDuration(200), {
      run(t: Time) {
        log.push([t, "c"]);
      },
      error() {},
      dispose() {},
    });

    s.advanceTo(toTime(150));
    expect(log).toEqual([
      [toTime(50), "b"],
      [toTime(100), "a"],
    ]);
    expect(s.currentTime()).toBe(toTime(150));

    s.advanceTo(toTime(200));
    expect(log).toEqual([
      [toTime(50), "b"],
      [toTime(100), "a"],
      [toTime(200), "c"],
    ]);
  });

  it("advance moves forward by a duration", () => {
    const s = new VirtualScheduler();
    const log: string[] = [];

    s.scheduleTask(toDuration(30), {
      run() {
        log.push("a");
      },
      error() {},
      dispose() {},
    });

    s.advance(toDuration(50));
    expect(log).toEqual(["a"]);
    expect(s.currentTime()).toBe(toTime(50));
  });

  it("flush executes all pending tasks", () => {
    const s = new VirtualScheduler();
    const log: string[] = [];

    s.scheduleTask(toDuration(1000), {
      run() {
        log.push("a");
      },
      error() {},
      dispose() {},
    });
    s.scheduleTask(toDuration(5000), {
      run() {
        log.push("b");
      },
      error() {},
      dispose() {},
    });

    s.flush();
    expect(log).toEqual(["a", "b"]);
  });

  it("cancelTask prevents execution", () => {
    const s = new VirtualScheduler();
    const log: string[] = [];

    const st = s.scheduleTask(toDuration(100), {
      run() {
        log.push("should not run");
      },
      error() {},
      dispose() {},
    });

    s.cancelTask(st);
    s.advanceTo(toTime(200));
    expect(log).toEqual([]);
  });

  it("dispose on ScheduledTask cancels it", () => {
    const s = new VirtualScheduler();
    const log: string[] = [];

    const st = s.scheduleTask(toDuration(100), {
      run() {
        log.push("cancelled");
      },
      error() {},
      dispose() {},
    });

    st.dispose();
    s.advanceTo(toTime(200));
    expect(log).toEqual([]);
  });

  it("tasks scheduled during execution run at correct time", () => {
    const s = new VirtualScheduler();
    const log: [number, string][] = [];

    s.scheduleTask(toDuration(100), {
      run(t: Time) {
        log.push([t as number, "first"]);
        // Schedule another task 50ms from now
        s.scheduleTask(toDuration(50), {
          run(t2: Time) {
            log.push([t2 as number, "nested"]);
          },
          error() {},
          dispose() {},
        });
      },
      error() {},
      dispose() {},
    });

    s.advanceTo(toTime(200));
    expect(log).toEqual([
      [100, "first"],
      [150, "nested"],
    ]);
  });

  it("relative scheduler shifts time", () => {
    const s = new VirtualScheduler();
    const rel = s.relative(toTime(500) as unknown as Parameters<typeof s.relative>[0]);
    // Relative scheduler should report shifted time
    expect(rel.currentTime() as number).toBe(500);
  });

  it("handles 10k tasks in correct order", () => {
    const s = new VirtualScheduler();
    const log: number[] = [];
    const n = 10_000;

    // Schedule in reverse order
    for (let i = n; i > 0; i--) {
      s.scheduleTask(toDuration(i), {
        run() {
          log.push(i);
        },
        error() {},
        dispose() {},
      });
    }

    s.flush();
    // Should execute in ascending order
    for (let i = 0; i < n; i++) {
      expect(log[i]).toBe(i + 1);
    }
  });
});
