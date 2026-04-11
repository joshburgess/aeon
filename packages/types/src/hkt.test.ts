import { describe, expectTypeOf, it } from "vitest";
import type { Kind } from "./hkt.js";
// Importing interfaces triggers the module augmentation that registers Event/Behavior
import type { Behavior, Event } from "./interfaces.js";

describe("HKT encoding", () => {
  it("Kind<'Event', number, string> resolves to Event<number, string>", () => {
    expectTypeOf<Kind<"Event", number, string>>().toEqualTypeOf<Event<number, string>>();
  });

  it("Kind<'Event', boolean, never> resolves to Event<boolean, never>", () => {
    expectTypeOf<Kind<"Event", boolean, never>>().toEqualTypeOf<Event<boolean, never>>();
  });

  it("Kind<'Behavior', number, string> resolves to Behavior<number, string>", () => {
    expectTypeOf<Kind<"Behavior", number, string>>().toEqualTypeOf<Behavior<number, string>>();
  });

  it("Kind<'Behavior', string, never> resolves to Behavior<string, never>", () => {
    expectTypeOf<Kind<"Behavior", string, never>>().toEqualTypeOf<Behavior<string, never>>();
  });
});
