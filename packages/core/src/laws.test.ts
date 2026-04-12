/**
 * Property-based tests verifying algebraic laws.
 *
 * Uses fast-check to generate random inputs and verify that
 * Functor, Monad, Applicative, and bridge laws hold for
 * arbitrary values and functions.
 */

import { VirtualScheduler } from "aeon-scheduler";
import type { Event, Time } from "aeon-types";
import { toTime } from "aeon-types";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  constantB,
  fromFunction,
  liftA2B,
  mapB,
  readBehavior,
  sample,
  stepper,
} from "./behavior.js";
import { chain } from "./combinators/chain.js";
import { catchError, throwError } from "./combinators/error.js";
import { filter } from "./combinators/filter.js";
import { map } from "./combinators/map.js";
import { scan } from "./combinators/scan.js";
import { drain, observe, reduce } from "./combinators/terminal.js";
import { empty, fromArray, now } from "./constructors.js";
import { _getSource } from "./internal/event.js";
import { TestScheduler } from "./internal/testScheduler.js";

// --- Helpers ---

/** Collect all values from a synchronous event. */
function collect<A>(event: Event<A, never>): A[] {
  const scheduler = new TestScheduler();
  const values: A[] = [];
  _getSource(event).run(
    {
      event(_t: Time, v: A) {
        values.push(v);
      },
      error() {},
      end() {},
    },
    scheduler,
  );
  return values;
}

/** Collect values via reduce (terminal combinator, async). */
async function collectAsync<A>(event: Event<A, never>): Promise<A[]> {
  const scheduler = new VirtualScheduler();
  return reduce((acc: A[], x: A) => [...acc, x], [] as A[], event, scheduler);
}

/** Identity function. */
const id = <A>(a: A): A => a;

/** Arbitrary small integer arrays (avoid huge arrays for perf). */
const smallIntArray = fc.array(fc.integer({ min: -100, max: 100 }), { maxLength: 50 });

/** Arbitrary pure functions int -> int. */
const intFn = fc.constantFrom(
  (x: number) => x + 1,
  (x: number) => x * 2,
  (x: number) => x * x,
  (x: number) => -x,
  (x: number) => Math.abs(x),
  (_x: number) => 0,
  (x: number) => x % 7,
);

/** Arbitrary predicates. */
const intPred = fc.constantFrom(
  (x: number) => x > 0,
  (x: number) => x % 2 === 0,
  (x: number) => x !== 0,
  (_x: number) => true,
  (_x: number) => false,
);

// --- Event Functor Laws ---

describe("Event Functor laws", () => {
  it("identity: map(id, e) === e", () => {
    fc.assert(
      fc.property(smallIntArray, (arr) => {
        const original = collect(fromArray(arr));
        const mapped = collect(map(id, fromArray(arr)));
        expect(mapped).toEqual(original);
      }),
    );
  });

  it("composition: map(f . g, e) === map(f, map(g, e))", () => {
    fc.assert(
      fc.property(smallIntArray, intFn, intFn, (arr, f, g) => {
        const composed = collect(map((x: number) => f(g(x)), fromArray(arr)));
        const chained = collect(map(f, map(g, fromArray(arr))));
        expect(chained).toEqual(composed);
      }),
    );
  });
});

// --- Event Monad Laws ---

describe("Event Monad laws", () => {
  it("left identity: chain(f, now(a)) === f(a)", () => {
    fc.assert(
      fc.property(fc.integer({ min: -100, max: 100 }), intFn, (a, f) => {
        const lhs = collect(chain((x: number) => now(f(x)), now(a)));
        const rhs = collect(now(f(a)));
        expect(lhs).toEqual(rhs);
      }),
    );
  });

  it("right identity: chain(now, m) === m", () => {
    fc.assert(
      fc.property(smallIntArray, (arr) => {
        const m = fromArray(arr);
        const lhs = collect(chain((x: number) => now(x), m));
        const rhs = collect(m);
        expect(lhs).toEqual(rhs);
      }),
    );
  });

  it("associativity: chain(g, chain(f, m)) === chain(x => chain(g, f(x)), m)", () => {
    fc.assert(
      fc.property(smallIntArray, (arr) => {
        const f = (x: number) => fromArray([x, x + 1]);
        const g = (x: number) => now(x * 10);
        const m = fromArray(arr);

        const lhs = collect(chain(g, chain(f, m)));
        const rhs = collect(chain((x: number) => chain(g, f(x)), m));
        expect(lhs).toEqual(rhs);
      }),
    );
  });
});

// --- Filter Laws ---

describe("Filter laws", () => {
  it("filter(const true, e) === e", () => {
    fc.assert(
      fc.property(smallIntArray, (arr) => {
        const original = collect(fromArray(arr));
        const filtered = collect(filter(() => true, fromArray(arr)));
        expect(filtered).toEqual(original);
      }),
    );
  });

  it("filter(const false, e) === empty()", () => {
    fc.assert(
      fc.property(smallIntArray, (arr) => {
        const filtered = collect(filter(() => false, fromArray(arr)));
        expect(filtered).toEqual([]);
      }),
    );
  });

  it("filter distributivity: filter(p, filter(q, e)) === filter(x => q(x) && p(x), e)", () => {
    fc.assert(
      fc.property(smallIntArray, intPred, intPred, (arr, p, q) => {
        const nested = collect(filter(p, filter(q, fromArray(arr))));
        const combined = collect(filter((x: number) => q(x) && p(x), fromArray(arr)));
        expect(nested).toEqual(combined);
      }),
    );
  });

  it("map-filter naturality: filter(p, map(f, e)) values equal map(f, filter(p . f, e))", () => {
    fc.assert(
      fc.property(smallIntArray, intFn, intPred, (arr, f, p) => {
        const lhs = collect(filter(p, map(f, fromArray(arr))));
        const rhs = collect(
          map(
            f,
            filter((x: number) => p(f(x)), fromArray(arr)),
          ),
        );
        expect(lhs).toEqual(rhs);
      }),
    );
  });
});

// --- Scan Laws ---

describe("Scan laws", () => {
  it("scan distributes over map: scan(f, s, map(g, e)) === scan((a, x) => f(a, g(x)), s, e)", () => {
    fc.assert(
      fc.property(smallIntArray, (arr) => {
        const f = (acc: number, x: number) => acc + x;
        const g = (x: number) => x * 2;

        const lhs = collect(scan(f, 0, map(g, fromArray(arr))));
        const rhs = collect(scan((acc: number, x: number) => f(acc, g(x)), 0, fromArray(arr)));
        expect(lhs).toEqual(rhs);
      }),
    );
  });
});

// --- Error Channel Laws ---

describe("Error channel laws", () => {
  it("catchError(h, throwError(e)) === h(e)", () => {
    fc.assert(
      fc.property(fc.string(), (msg) => {
        const lhs = collect(catchError(() => now(42), throwError(msg)));
        const rhs = collect(now(42));
        expect(lhs).toEqual(rhs);
      }),
    );
  });

  it("catchError(throwError, e) is identity for non-erroring streams", () => {
    fc.assert(
      fc.property(smallIntArray, (arr) => {
        const lhs = collect(catchError((e: never) => throwError(e), fromArray(arr)));
        const rhs = collect(fromArray(arr));
        expect(lhs).toEqual(rhs);
      }),
    );
  });
});

// --- Behavior Functor Laws ---

describe("Behavior Functor laws", () => {
  it("identity: mapB(id, b)(t) === b(t)", () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1000, noNaN: true }), (t) => {
        const time = toTime(t);
        const b = fromFunction((t: number) => t * 2);
        expect(readBehavior(mapB(id, b), time)).toBe(readBehavior(b, time));
      }),
    );
  });

  it("composition: mapB(f . g, b)(t) === mapB(f, mapB(g, b))(t)", () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1000, noNaN: true }), intFn, intFn, (t, f, g) => {
        const time = toTime(t);
        const b = fromFunction((t: number) => Math.round(t));
        const composed = readBehavior(
          mapB((x: number) => f(g(x)), b),
          time,
        );
        const chained = readBehavior(mapB(f, mapB(g, b)), time);
        expect(chained).toBe(composed);
      }),
    );
  });
});

// --- Behavior Applicative Laws ---

describe("Behavior Applicative laws", () => {
  it("identity: liftA2B(id-like, constantB(x), _) preserves value", () => {
    fc.assert(
      fc.property(fc.integer(), fc.double({ min: 0, max: 1000, noNaN: true }), (x, t) => {
        const time = toTime(t);
        const result = readBehavior(
          liftA2B((a: number, _b: number) => a, constantB(x), constantB(0)),
          time,
        );
        expect(result).toBe(x);
      }),
    );
  });

  it("homomorphism: liftA2B(f, constantB(a), constantB(b)) === constantB(f(a, b))", () => {
    fc.assert(
      fc.property(
        fc.integer(),
        fc.integer(),
        fc.double({ min: 0, max: 1000, noNaN: true }),
        (a, b, t) => {
          const time = toTime(t);
          const f = (x: number, y: number) => x + y;
          const lhs = readBehavior(liftA2B(f, constantB(a), constantB(b)), time);
          const rhs = readBehavior(constantB(f(a, b)), time);
          expect(lhs).toBe(rhs);
        },
      ),
    );
  });
});

// --- Behavior-Event Bridge Laws ---

describe("Behavior-Event bridge laws", () => {
  it("sample(constantB(x), e) === map(const x, e)", () => {
    fc.assert(
      fc.property(fc.integer(), smallIntArray, (x, arr) => {
        const lhs = collect(sample(constantB(x), fromArray(arr)));
        const rhs = collect(map(() => x, fromArray(arr)));
        expect(lhs).toEqual(rhs);
      }),
    );
  });

  it("sample(mapB(f, b), e) === map(f, sample(b, e))", () => {
    fc.assert(
      fc.property(smallIntArray, intFn, (arr, f) => {
        const b = constantB(42);
        const lhs = collect(sample(mapB(f, b), fromArray(arr)));
        const rhs = collect(map(f, sample(b, fromArray(arr))));
        expect(lhs).toEqual(rhs);
      }),
    );
  });

  it("sample(constantB(x), empty()) === empty()", () => {
    fc.assert(
      fc.property(fc.integer(), (x) => {
        const result = collect(sample(constantB(x), empty()));
        expect(result).toEqual([]);
      }),
    );
  });
});
