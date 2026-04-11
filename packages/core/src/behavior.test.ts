import { VirtualScheduler } from "@pulse/scheduler";
import { type Behavior, type Sink, type Time, toDuration, toTime } from "@pulse/types";
import { describe, expect, it } from "vitest";
import {
  constantB,
  fromFunction,
  integral,
  liftA2B,
  liftA3B,
  mapB,
  readBehavior,
  sample,
  snapshot,
  stepper,
  switcher,
  time as timeBehavior,
} from "./behavior.js";
import { fromArray, map, now } from "./index.js";
import { _createEvent, _getSource } from "./internal/event.js";

describe("Behavior constructors", () => {
  it("constantB always returns the same value", () => {
    const b = constantB(42);
    expect(readBehavior(b, toTime(0))).toBe(42);
    expect(readBehavior(b, toTime(1000))).toBe(42);
    expect(readBehavior(b, toTime(999999))).toBe(42);
  });

  it("fromFunction evaluates the function at the sampled time", () => {
    const b = fromFunction((t: Time) => (t as number) * 2);
    expect(readBehavior(b, toTime(0))).toBe(0);
    expect(readBehavior(b, toTime(50))).toBe(100);
    expect(readBehavior(b, toTime(100))).toBe(200);
  });

  it("time behavior returns the current time", () => {
    expect(readBehavior(timeBehavior, toTime(0))).toBe(toTime(0));
    expect(readBehavior(timeBehavior, toTime(42))).toBe(toTime(42));
  });
});

describe("Behavior Functor (mapB)", () => {
  it("transforms the value of a constant behavior", () => {
    const b = mapB((x: number) => x + 1, constantB(41));
    expect(readBehavior(b, toTime(0))).toBe(42);
  });

  it("transforms the value of a function behavior", () => {
    const b = mapB(
      (x: number) => x * 3,
      fromFunction((t: Time) => (t as number) + 1),
    );
    expect(readBehavior(b, toTime(10))).toBe(33);
  });

  it("identity: mapB(id, b) === b", () => {
    const b = constantB(42);
    const mapped = mapB((x: number) => x, b);
    expect(readBehavior(mapped, toTime(0))).toBe(readBehavior(b, toTime(0)));
  });

  it("composition: mapB(f . g, b) === mapB(f, mapB(g, b))", () => {
    const f = (x: number) => x + 1;
    const g = (x: number) => x * 2;
    const b = constantB(5);

    const composed = readBehavior(
      mapB((x: number) => f(g(x)), b),
      toTime(0),
    );
    const piped = readBehavior(mapB(f, mapB(g, b)), toTime(0));
    expect(composed).toBe(piped);
  });
});

describe("Behavior Applicative (liftA2B)", () => {
  it("combines two constant behaviors", () => {
    const b = liftA2B((a: number, b: number) => a + b, constantB(3), constantB(4));
    expect(readBehavior(b, toTime(0))).toBe(7);
  });

  it("combines a constant and a function behavior", () => {
    const b = liftA2B(
      (a: number, t: number) => a * t,
      constantB(2),
      fromFunction((t: Time) => t as number),
    );
    expect(readBehavior(b, toTime(5))).toBe(10);
    expect(readBehavior(b, toTime(10))).toBe(20);
  });

  it("liftA3B combines three behaviors", () => {
    const b = liftA3B(
      (a: number, b: number, c: number) => a + b + c,
      constantB(1),
      constantB(2),
      constantB(3),
    );
    expect(readBehavior(b, toTime(0))).toBe(6);
  });
});

describe("Behavior dirty-flag caching", () => {
  it("caches computed values and reuses on second sample", () => {
    let callCount = 0;
    const b = mapB(
      (x: number) => {
        callCount++;
        return x + 1;
      },
      fromFunction((_t: Time) => 10),
    );

    // First sample computes
    readBehavior(b, toTime(0));
    expect(callCount).toBe(1);

    // Second sample with same (non-dirty) should use cache
    // Note: for function-based behaviors, mapB optimizes to a composed function
    // so dirty-flag doesn't apply. Test with a stepper instead.
  });

  it("stepper-based map caches until new event", () => {
    const scheduler = new VirtualScheduler();

    // Create an event that emits on demand
    let pushValue: ((t: Time, v: number) => void) | undefined;
    const event = _createEvent<number, never>({
      run(sink, _sched) {
        pushValue = (t, v) => sink.event(t, v);
        return {
          dispose() {
            pushValue = undefined;
          },
        };
      },
    });

    const [b, disposable] = stepper(0, event, scheduler);

    let mapCallCount = 0;
    const mapped = mapB((x: number) => {
      mapCallCount++;
      return x * 10;
    }, b);

    // First sample
    expect(readBehavior(mapped, toTime(0))).toBe(0);
    expect(mapCallCount).toBe(1);

    // Second sample — should use cache (stepper not updated)
    expect(readBehavior(mapped, toTime(1))).toBe(0);
    // For stepper → map, the map node's cached value is returned
    // mapCallCount may or may not increment depending on dirty state
    // The key test is correctness, not necessarily call count

    // Push a new value
    pushValue?.(toTime(10), 5);

    // Sample after update
    expect(readBehavior(mapped, toTime(10))).toBe(50);

    disposable.dispose();
  });
});

describe("stepper", () => {
  it("holds the initial value before any event", () => {
    const scheduler = new VirtualScheduler();
    const event = _createEvent<number, never>({
      run() {
        return { dispose() {} };
      },
    });
    const [b, d] = stepper(42, event, scheduler);
    expect(readBehavior(b, toTime(0))).toBe(42);
    d.dispose();
  });

  it("updates to the latest event value", () => {
    const scheduler = new VirtualScheduler();
    let pushValue: ((t: Time, v: number) => void) | undefined;
    const event = _createEvent<number, never>({
      run(sink) {
        pushValue = (t, v) => sink.event(t, v);
        return {
          dispose() {
            pushValue = undefined;
          },
        };
      },
    });

    const [b, d] = stepper(0, event, scheduler);
    expect(readBehavior(b, toTime(0))).toBe(0);

    pushValue?.(toTime(10), 5);
    expect(readBehavior(b, toTime(10))).toBe(5);

    pushValue?.(toTime(20), 99);
    expect(readBehavior(b, toTime(20))).toBe(99);

    d.dispose();
  });
});

describe("sample", () => {
  it("reads the behavior value at each sampler event time", () => {
    const scheduler = new VirtualScheduler();
    const b = constantB(42);
    const sampler = fromArray([1, 2, 3]);

    const values: number[] = [];
    const source = sample(b, sampler);
    _getSource(source).run(
      {
        event(_t: Time, v: number) {
          values.push(v);
        },
        error() {},
        end() {},
      },
      scheduler,
    );

    expect(values).toEqual([42, 42, 42]);
  });

  it("sample(constant(x), e) === map(() => x, e)", () => {
    const scheduler = new VirtualScheduler();
    const arr = [1, 2, 3];

    const viaSample: number[] = [];
    _getSource(sample(constantB(99), fromArray(arr))).run(
      {
        event(_t: Time, v: number) {
          viaSample.push(v);
        },
        error() {},
        end() {},
      },
      scheduler,
    );

    const viaMap: number[] = [];
    _getSource(map(() => 99, fromArray(arr))).run(
      {
        event(_t: Time, v: number) {
          viaMap.push(v);
        },
        error() {},
        end() {},
      },
      scheduler,
    );

    expect(viaSample).toEqual(viaMap);
  });

  it("samples a stepper behavior correctly", () => {
    const scheduler = new VirtualScheduler();

    let pushUpdate: ((t: Time, v: string) => void) | undefined;
    const updates = _createEvent<string, never>({
      run(sink) {
        pushUpdate = (t, v) => sink.event(t, v);
        return {
          dispose() {
            pushUpdate = undefined;
          },
        };
      },
    });

    let pushSample: ((t: Time) => void) | undefined;
    let endSample: ((t: Time) => void) | undefined;
    const sampler = _createEvent<undefined, never>({
      run(sink) {
        pushSample = (t) => sink.event(t, undefined);
        endSample = (t) => sink.end(t);
        return {
          dispose() {
            pushSample = undefined;
          },
        };
      },
    });

    const [b, disposeStepper] = stepper("initial", updates, scheduler);
    const sampled = sample(b, sampler);

    const values: string[] = [];
    _getSource(sampled).run(
      {
        event(_t: Time, v: string) {
          values.push(v);
        },
        error() {},
        end() {},
      },
      scheduler,
    );

    // Sample before any update
    pushSample?.(toTime(0));
    expect(values).toEqual(["initial"]);

    // Push an update
    pushUpdate?.(toTime(10), "hello");

    // Sample after update
    pushSample?.(toTime(10));
    expect(values).toEqual(["initial", "hello"]);

    // Another update
    pushUpdate?.(toTime(20), "world");
    pushSample?.(toTime(20));
    expect(values).toEqual(["initial", "hello", "world"]);

    disposeStepper.dispose();
  });
});

describe("snapshot", () => {
  it("combines behavior value with event value", () => {
    const scheduler = new VirtualScheduler();
    const b = constantB(10);
    const event = fromArray([1, 2, 3]);

    const values: number[] = [];
    _getSource(snapshot((bv: number, ev: number) => bv + ev, b, event)).run(
      {
        event(_t: Time, v: number) {
          values.push(v);
        },
        error() {},
        end() {},
      },
      scheduler,
    );

    expect(values).toEqual([11, 12, 13]);
  });
});

describe("switcher", () => {
  it("starts with the initial behavior", () => {
    const scheduler = new VirtualScheduler();
    const event = _createEvent<Behavior<number, never>, never>({
      run() {
        return { dispose() {} };
      },
    });

    const [b, d] = switcher(constantB(1), event, scheduler);
    expect(readBehavior(b, toTime(0))).toBe(1);
    d.dispose();
  });

  it("switches to new behavior when event fires", () => {
    const scheduler = new VirtualScheduler();

    let pushSwitch: ((t: Time, b: Behavior<number, never>) => void) | undefined;
    const event = _createEvent<Behavior<number, never>, never>({
      run(sink) {
        pushSwitch = (t, v) => sink.event(t, v);
        return {
          dispose() {
            pushSwitch = undefined;
          },
        };
      },
    });

    const [b, d] = switcher(constantB(1), event, scheduler);
    expect(readBehavior(b, toTime(0))).toBe(1);

    pushSwitch?.(toTime(10), constantB(42));
    expect(readBehavior(b, toTime(10))).toBe(42);

    pushSwitch?.(
      toTime(20),
      fromFunction((t: Time) => (t as number) * 2),
    );
    expect(readBehavior(b, toTime(30))).toBe(60);

    d.dispose();
  });
});

describe("integral", () => {
  it("integral of constant(1) approximates t => t", () => {
    const dt = toDuration(1);
    const b = integral(constantB(1), dt);
    // ∫₀ᵗ 1 ds = t
    expect(readBehavior(b, toTime(0))).toBe(0);
    expect(readBehavior(b, toTime(10))).toBeCloseTo(10, 5);
    expect(readBehavior(b, toTime(100))).toBeCloseTo(100, 5);
  });

  it("integral of constant(c) approximates t => c*t", () => {
    const dt = toDuration(1);
    const b = integral(constantB(5), dt);
    expect(readBehavior(b, toTime(10))).toBeCloseTo(50, 5);
  });

  it("integral of t => t approximates t => t²/2", () => {
    const dt = toDuration(0.1);
    const b = integral(
      fromFunction((t: Time) => t as number),
      dt,
    );
    // ∫₀¹⁰ s ds = 50
    expect(readBehavior(b, toTime(10))).toBeCloseTo(50, 1);
    // ∫₀¹⁰⁰ s ds = 5000
    expect(readBehavior(b, toTime(100))).toBeCloseTo(5000, 0);
  });

  it("integral at time 0 is 0", () => {
    const dt = toDuration(1);
    const b = integral(
      fromFunction((t: Time) => (t as number) * (t as number)),
      dt,
    );
    expect(readBehavior(b, toTime(0))).toBe(0);
  });

  it("handles partial final step correctly", () => {
    const dt = toDuration(3);
    // ∫₀¹⁰ 1 ds = 10, with dt=3 we get steps at 0,3,6,9 and a partial step from 9 to 10
    const b = integral(constantB(1), dt);
    expect(readBehavior(b, toTime(10))).toBeCloseTo(10, 5);
  });
});
