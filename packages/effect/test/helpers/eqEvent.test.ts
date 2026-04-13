import { at, empty, map, now } from "aeon-core"
import type { CollectedEntry } from "aeon-test"
import { toTime } from "aeon-types"
import { describe, expect, it } from "vitest"
import { eqEvent } from "./eqEvent.js"
import { fromEntries } from "./fromEntries.js"

describe("eqEvent", () => {
  it("considers identical traces equal", () => {
    const entries: CollectedEntry<number, never>[] = [
      { type: "event", time: toTime(0), value: 1 },
      { type: "event", time: toTime(10), value: 2 },
      { type: "end", time: toTime(10) },
    ]
    expect(eqEvent(fromEntries(entries), fromEntries(entries))).toBe(true)
  })

  it("distinguishes events that differ in value", () => {
    expect(eqEvent(now(1), now(2))).toBe(false)
  })

  it("distinguishes events that differ in time", () => {
    expect(eqEvent(at(toTime(5), 1), at(toTime(10), 1))).toBe(false)
  })

  it("distinguishes ended vs still-running", () => {
    const ended = fromEntries<number>([
      { type: "event", time: toTime(0), value: 1 },
      { type: "end", time: toTime(0) },
    ])
    const open = fromEntries<number>([{ type: "event", time: toTime(0), value: 1 }])
    expect(eqEvent(ended, open)).toBe(false)
  })

  it("respects functor identity: map id ≡ id", () => {
    const e = now(42)
    expect(
      eqEvent(
        map((x: number) => x, e),
        e,
      ),
    ).toBe(true)
  })

  it("treats empty events as equal", () => {
    expect(eqEvent(empty<number>(), empty<number>())).toBe(true)
  })

  it("uses a custom eqA when provided", () => {
    const a = now({ id: 1, name: "a" })
    const b = now({ id: 1, name: "b" })
    const eqById = <T extends { id: number }>(x: T, y: T) => x.id === y.id
    expect(eqEvent(a, b, { eqA: eqById })).toBe(true)
    expect(eqEvent(a, b)).toBe(false)
  })

  it("distinguishes errors that differ in payload", () => {
    const e1 = fromEntries<number, string>([{ type: "error", time: toTime(0), error: "x" }])
    const e2 = fromEntries<number, string>([{ type: "error", time: toTime(0), error: "y" }])
    expect(eqEvent(e1, e2)).toBe(false)
  })
})
