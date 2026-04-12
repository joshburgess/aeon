/**
 * Behavior-specific benchmarks (Pulse only — other libs lack Behaviors).
 *
 * - liftA2 sampled at 60fps for 10 simulated seconds
 * - stepper with 1M events, sampled at 1000 points
 * - switcher with 1000 behavior switches
 * - accumB with 100k events and periodic sampling
 * - derivative of a function behavior
 * - switchB (Monad join) with nested function behaviors
 */

import { bench, describe } from "vitest";

import {
  accumB,
  constantB,
  createAdapter,
  derivative,
  fromFunction,
  integral,
  liftA2B,
  mapB,
  readBehavior,
  stepper,
  switchB,
  switcher,
} from "aeon-core";
import { VirtualScheduler } from "aeon-scheduler";
import { type Behavior, type Duration, type Time, toDuration, toTime } from "aeon-types";

describe("liftA2 sampled at 60fps for 10s", () => {
  bench("pulse", () => {
    const a = fromFunction((t: Time) => Math.sin((t as number) / 1000));
    const b = fromFunction((t: Time) => Math.cos((t as number) / 1000));
    const combined = liftA2B((x: number, y: number) => x * x + y * y, a, b);

    // 60fps × 10s = 600 samples
    const dt = 1000 / 60;
    for (let i = 0; i < 600; i++) {
      readBehavior(combined, toTime(i * dt));
    }
  });
});

describe("stepper: 1M events, 1000 samples", () => {
  bench("pulse", () => {
    const scheduler = new VirtualScheduler();
    const [push, event] = createAdapter<number>();

    // Subscribe the stepper to the adapter event
    const [b, disposable] = stepper(0, event, scheduler);
    const N = 1_000_000;
    const samplePoints = 1000;
    const sampleInterval = N / samplePoints;

    let sampleIdx = 0;
    for (let i = 0; i < N; i++) {
      push(i);

      // Sample at evenly spaced points
      if (i >= sampleIdx * sampleInterval) {
        readBehavior(b, toTime(i));
        sampleIdx++;
      }
    }

    disposable.dispose();
  });
});

describe("switcher: 1000 behavior switches", () => {
  bench("pulse", () => {
    const scheduler = new VirtualScheduler();
    const [pushSwitch, switchEvent] = createAdapter<Behavior<number, never>>();

    const [b, disposable] = switcher(constantB(0), switchEvent, scheduler);

    for (let i = 0; i < 1000; i++) {
      pushSwitch(constantB(i));
      readBehavior(b, toTime(i));
    }

    disposable.dispose();
  });
});

describe("mapB chain: 10-deep map of stepper", () => {
  bench("pulse", () => {
    const scheduler = new VirtualScheduler();
    const [push, event] = createAdapter<number>();

    const [base, disposable] = stepper(0, event, scheduler);

    // Build 10-deep mapB chain
    let b: Behavior<number, never> = base;
    for (let i = 0; i < 10; i++) {
      b = mapB((x: number) => x + 1, b);
    }

    // Push 10k events, sample after each
    for (let i = 0; i < 10_000; i++) {
      push(i);
      readBehavior(b, toTime(i));
    }

    disposable.dispose();
  });
});

// ============================================================
// accumB: fold events into a behavior
// ============================================================

describe("accumB: 100k events, sample every 100", () => {
  bench("pulse", () => {
    const scheduler = new VirtualScheduler();
    const [push, event] = createAdapter<number>();

    const [b, disposable] = accumB((acc: number, x: number) => acc + x, 0, event, scheduler);

    for (let i = 0; i < 100_000; i++) {
      push(i);
      if (i % 100 === 0) readBehavior(b, toTime(i));
    }

    disposable.dispose();
  });
});

// ============================================================
// derivative: numerical differentiation
// ============================================================

describe("derivative: sample at 10k points", () => {
  bench("pulse", () => {
    const dt = toDuration(0.01);
    // d/dt(sin(t)) = cos(t)
    const b = derivative(
      fromFunction((t: Time) => Math.sin((t as number) / 100)),
      dt,
    );

    for (let i = 0; i < 10_000; i++) {
      readBehavior(b, toTime(i));
    }
  });
});

// ============================================================
// switchB: Monad join for behaviors
// ============================================================

describe("switchB: time-dependent outer, 10k samples", () => {
  bench("pulse", () => {
    // Outer behavior selects between two inner behaviors based on time
    const inner1 = fromFunction((t: Time) => Math.sin((t as number) / 100));
    const inner2 = fromFunction((t: Time) => Math.cos((t as number) / 100));

    const bb = fromFunction((t: Time) => ((t as number) % 200 < 100 ? inner1 : inner2));

    const b = switchB(bb);

    for (let i = 0; i < 10_000; i++) {
      readBehavior(b, toTime(i));
    }
  });
});
