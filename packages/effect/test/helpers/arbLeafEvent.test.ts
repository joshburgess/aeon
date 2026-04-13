import * as fc from "effect/FastCheck";
import { describe, expect, it } from "vitest";
import { arbLeafEventTrace, defaultArbHorizon } from "./arbLeafEvent.js";
import { eqEvent } from "./eqEvent.js";
import { fromEntries } from "./fromEntries.js";

describe("arbLeafEvent", () => {
  it("produces events whose traces are time-sorted", () => {
    fc.assert(
      fc.property(arbLeafEventTrace({ value: fc.integer() }), ({ entries }) => {
        for (let i = 1; i < entries.length; i++) {
          const prev = entries[i - 1]!.time as number;
          const cur = entries[i]!.time as number;
          expect(cur).toBeGreaterThanOrEqual(prev);
        }
      }),
    );
  });

  it("never generates more than one terminator and always at the end", () => {
    fc.assert(
      fc.property(arbLeafEventTrace({ value: fc.integer() }), ({ entries }) => {
        const terminators = entries.filter((e) => e.type === "end" || e.type === "error");
        expect(terminators.length).toBeLessThanOrEqual(1);
        if (terminators.length === 1) {
          expect(entries[entries.length - 1]).toBe(terminators[0]);
        }
      }),
    );
  });

  it("is deterministic: the generated event equals one rebuilt from its trace", () => {
    fc.assert(
      fc.property(arbLeafEventTrace({ value: fc.integer() }), ({ entries, event }) => {
        expect(eqEvent(event, fromEntries(entries), { horizon: defaultArbHorizon })).toBe(true);
      }),
    );
  });

  it("respects the horizon bound on entry times", () => {
    const horizon = 50;
    fc.assert(
      fc.property(arbLeafEventTrace({ value: fc.integer(), horizon }), ({ entries }) => {
        for (const e of entries) {
          expect(e.time as number).toBeLessThan(horizon);
        }
      }),
    );
  });
});
