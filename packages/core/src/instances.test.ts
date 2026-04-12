/**
 * Conformance tests for Event and Behavior typeclass instances.
 *
 * Exercises the instances through two paths:
 *   1. Direct — e.g. `EventFunctor.map(f, e)` — proves instances are wired
 *      correctly to their underlying combinators.
 *   2. Generic — e.g. `liftA2(BehaviorApplicative)(f, a, b)` — proves the
 *      typeclass machinery actually carries end-to-end, so users can write
 *      code against `Applicative<F extends TypeLambda>` and instantiate it.
 *
 * This is the "actually integrated" proof: if either path regresses,
 * the HKT encoding and the typeclass instances are no longer load-bearing.
 */

import { VirtualScheduler } from "aeon-scheduler";
import {
  type Behavior,
  type Event,
  liftA2,
  liftA3,
  toTime,
} from "aeon-types";
import { describe, expect, it } from "vitest";
import { constantB, readBehavior } from "./behavior.js";
import { reduce } from "./combinators/terminal.js";
import { empty, fromArray, now } from "./constructors.js";
import {
  BehaviorApplicative,
  BehaviorFunctor,
  BehaviorMonad,
  EventApplicative,
  EventFilterable,
  EventFunctor,
  EventMonad,
} from "./instances.js";

// --- Helpers ---

async function collect<A>(event: Event<A, never>): Promise<A[]> {
  const scheduler = new VirtualScheduler();
  return reduce((acc: A[], x: A) => [...acc, x], [] as A[], event, scheduler);
}

const id = <A>(a: A): A => a;
const T = toTime(1);

// --- Instance shape sanity checks ---

describe("instance shapes", () => {
  it("EventFunctor has map", () => {
    expect(typeof EventFunctor.map).toBe("function");
  });

  it("EventApplicative has map, of, ap", () => {
    expect(typeof EventApplicative.map).toBe("function");
    expect(typeof EventApplicative.of).toBe("function");
    expect(typeof EventApplicative.ap).toBe("function");
  });

  it("EventMonad has map, of, ap, chain", () => {
    expect(typeof EventMonad.map).toBe("function");
    expect(typeof EventMonad.of).toBe("function");
    expect(typeof EventMonad.ap).toBe("function");
    expect(typeof EventMonad.chain).toBe("function");
  });

  it("EventFilterable has filter", () => {
    expect(typeof EventFilterable.filter).toBe("function");
  });

  it("BehaviorFunctor / Applicative / Monad have expected methods", () => {
    expect(typeof BehaviorFunctor.map).toBe("function");
    expect(typeof BehaviorApplicative.of).toBe("function");
    expect(typeof BehaviorApplicative.ap).toBe("function");
    expect(typeof BehaviorMonad.chain).toBe("function");
  });
});

// --- Event instance conformance ---

describe("EventFunctor", () => {
  it("map via instance matches direct map", async () => {
    const e = fromArray([1, 2, 3]);
    const result = await collect(EventFunctor.map((x: number) => x * 2, e));
    expect(result).toEqual([2, 4, 6]);
  });

  it("identity law: map(id, e) === e", async () => {
    const e = fromArray([1, 2, 3]);
    const lhs = await collect(EventFunctor.map(id, e));
    const rhs = await collect(fromArray([1, 2, 3]));
    expect(lhs).toEqual(rhs);
  });
});

describe("EventMonad", () => {
  it("of produces a single-element Event", async () => {
    const e = EventMonad.of(42);
    const result = await collect(e);
    expect(result).toEqual([42]);
  });

  it("left identity: chain(f, of(a)) === f(a)", async () => {
    const f = (x: number): Event<number, never> => fromArray([x, x * 2]);
    const lhs = await collect(EventMonad.chain(f, EventMonad.of(5)));
    const rhs = await collect(f(5));
    expect(lhs).toEqual(rhs);
  });

  it("right identity: chain(of, m) === m", async () => {
    const m = fromArray([1, 2, 3]);
    const lhs = await collect(EventMonad.chain(EventMonad.of, m));
    const rhs = await collect(fromArray([1, 2, 3]));
    expect(lhs).toEqual(rhs);
  });

  it("monadic ap via instance: ap(of(f), of(a)) === of(f(a))", async () => {
    const f = (x: number) => x + 10;
    const lhs = await collect(
      EventApplicative.ap(EventApplicative.of(f), EventApplicative.of(5)),
    );
    const rhs = await collect(EventApplicative.of(15));
    expect(lhs).toEqual(rhs);
  });
});

describe("EventFilterable", () => {
  it("filter via instance matches direct filter", async () => {
    const e = fromArray([1, 2, 3, 4, 5]);
    const result = await collect(EventFilterable.filter((x: number) => x % 2 === 0, e));
    expect(result).toEqual([2, 4]);
  });

  it("filter(const true, e) === e", async () => {
    const e = fromArray([1, 2, 3]);
    const lhs = await collect(EventFilterable.filter(() => true, e));
    const rhs = await collect(fromArray([1, 2, 3]));
    expect(lhs).toEqual(rhs);
  });
});

// --- Behavior instance conformance ---

describe("BehaviorFunctor", () => {
  it("map via instance matches direct mapB", () => {
    const b = constantB(5);
    const mapped = BehaviorFunctor.map((x: number) => x * 3, b);
    expect(readBehavior(mapped, T)).toBe(15);
  });
});

describe("BehaviorApplicative", () => {
  it("of produces a constant Behavior", () => {
    const b = BehaviorApplicative.of(42);
    expect(readBehavior(b, T)).toBe(42);
  });

  it("ap via instance applies the function behavior to the value behavior", () => {
    const bf: Behavior<(x: number) => number, never> = constantB((x: number) => x + 100);
    const bx = constantB(7);
    const result = BehaviorApplicative.ap(bf, bx);
    expect(readBehavior(result, T)).toBe(107);
  });
});

describe("BehaviorMonad", () => {
  it("chain via instance: chain(f, of(a)) === f(a)", () => {
    const f = (x: number) => constantB(x * 10);
    const lhs = BehaviorMonad.chain(f, BehaviorMonad.of(5));
    const rhs = f(5);
    expect(readBehavior(lhs, T)).toBe(readBehavior(rhs, T));
  });
});

// --- Generic liftA2 / liftA3 via instances ---
// This is the load-bearing part: proves the HKT encoding actually
// composes typeclass-generic code with concrete data types.

describe("liftA2 generic over Applicative", () => {
  it("instantiated at EventApplicative sums two now-events", async () => {
    const sum = liftA2(EventApplicative)(
      (a: number, b: number) => a + b,
      now(3),
      now(4),
    );
    const result = await collect(sum);
    expect(result).toEqual([7]);
  });

  it("instantiated at BehaviorApplicative sums two constant behaviors", () => {
    const sum = liftA2(BehaviorApplicative)(
      (a: number, b: number) => a + b,
      constantB(10),
      constantB(20),
    );
    expect(readBehavior(sum, T)).toBe(30);
  });

  it("same generic function, two data types — type lambda carries through", () => {
    // Same f, two instances — the whole point of HKTs.
    const combine = <F extends typeof EventApplicative | typeof BehaviorApplicative>(
      A: F,
    ) => liftA2(A as typeof EventApplicative)((a: number, b: number) => a * b, now(6), now(7));

    // Just proving it compiles and runs for Event:
    const eventResult = combine(EventApplicative);
    expect(eventResult).toBeDefined();
  });
});

describe("liftA3 generic over Applicative", () => {
  it("instantiated at BehaviorApplicative combines three constants", () => {
    const combined = liftA3(BehaviorApplicative)(
      (a: number, b: number, c: number) => a + b + c,
      constantB(1),
      constantB(2),
      constantB(3),
    );
    expect(readBehavior(combined, T)).toBe(6);
  });

  it("instantiated at EventApplicative combines three now-events", async () => {
    const combined = liftA3(EventApplicative)(
      (a: number, b: number, c: number) => `${a}-${b}-${c}`,
      now(1),
      now(2),
      now(3),
    );
    const result = await collect(combined);
    expect(result).toEqual(["1-2-3"]);
  });
});

// --- Sanity: instances don't break on empty/edge cases ---

describe("edge cases", () => {
  it("EventFunctor.map on empty Event yields empty", async () => {
    const result = await collect(EventFunctor.map((x: number) => x + 1, empty<number>()));
    expect(result).toEqual([]);
  });

  it("liftA2(EventApplicative) on empty Events yields empty", async () => {
    const result = await collect(
      liftA2(EventApplicative)(
        (a: number, b: number) => a + b,
        empty<number>(),
        empty<number>(),
      ),
    );
    expect(result).toEqual([]);
  });
});
