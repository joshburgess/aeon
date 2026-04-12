import { describe, expectTypeOf, it } from "vitest";
import type { Kind } from "./hkt.js";
import type { Behavior, BehaviorTypeLambda, Event, EventTypeLambda } from "./interfaces.js";

describe("Type Lambda HKT encoding", () => {
  it("Kind<EventTypeLambda, number, string> resolves to Event<number, string>", () => {
    expectTypeOf<Kind<EventTypeLambda, number, string>>().toEqualTypeOf<Event<number, string>>();
  });

  it("Kind<EventTypeLambda, boolean> defaults E to never", () => {
    expectTypeOf<Kind<EventTypeLambda, boolean>>().toEqualTypeOf<Event<boolean, never>>();
  });

  it("Kind<BehaviorTypeLambda, number, string> resolves to Behavior<number, string>", () => {
    expectTypeOf<Kind<BehaviorTypeLambda, number, string>>().toEqualTypeOf<
      Behavior<number, string>
    >();
  });

  it("Kind<BehaviorTypeLambda, string> defaults E to never", () => {
    expectTypeOf<Kind<BehaviorTypeLambda, string>>().toEqualTypeOf<Behavior<string, never>>();
  });
});
