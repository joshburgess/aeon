import { describe, expectTypeOf, it } from "vitest";
import type { Kind } from "./hkt.js";
import type { Behavior, BehaviorTypeLambda, Event, EventTypeLambda } from "./interfaces.js";

// Convention for aeon data types (matches Effect):
//   Kind<F, In, Out2, Out1, Target>
//     Target = value (A)
//     Out1   = error (E)
//     Out2   = never (unused)
//     In     = unknown (unused)

describe("Type Lambda HKT encoding", () => {
  it("Kind<EventTypeLambda, unknown, never, string, number> resolves to Event<number, string>", () => {
    expectTypeOf<Kind<EventTypeLambda, unknown, never, string, number>>().toEqualTypeOf<
      Event<number, string>
    >();
  });

  it("Kind<EventTypeLambda, unknown, never, never, boolean> resolves to Event<boolean, never>", () => {
    expectTypeOf<Kind<EventTypeLambda, unknown, never, never, boolean>>().toEqualTypeOf<
      Event<boolean, never>
    >();
  });

  it("Kind<BehaviorTypeLambda, unknown, never, string, number> resolves to Behavior<number, string>", () => {
    expectTypeOf<Kind<BehaviorTypeLambda, unknown, never, string, number>>().toEqualTypeOf<
      Behavior<number, string>
    >();
  });

  it("Kind<BehaviorTypeLambda, unknown, never, never, string> resolves to Behavior<string, never>", () => {
    expectTypeOf<Kind<BehaviorTypeLambda, unknown, never, never, string>>().toEqualTypeOf<
      Behavior<string, never>
    >();
  });
});
