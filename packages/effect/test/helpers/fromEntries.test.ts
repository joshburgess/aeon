import { VirtualScheduler } from "aeon-scheduler"
import { type CollectedEntry, collectEvents } from "aeon-test"
import { toTime } from "aeon-types"
import { describe, expect, it } from "vitest"
import { fromEntries } from "./fromEntries.js"

const time = (n: number) => toTime(n)

describe("fromEntries", () => {
  it("round-trips a pure value trace through collectEvents", () => {
    const entries: CollectedEntry<number, never>[] = [
      { type: "event", time: time(0), value: 1 },
      { type: "event", time: time(10), value: 2 },
      { type: "event", time: time(25), value: 3 },
      { type: "end", time: time(25) },
    ]

    const scheduler = new VirtualScheduler()
    const result = collectEvents(fromEntries(entries), scheduler)
    scheduler.advanceTo(time(100))
    result.disposable.dispose()

    expect(result.entries).toEqual(entries)
    expect(result.ended).toBe(true)
  })

  it("round-trips a trace containing an error terminator", () => {
    const entries: CollectedEntry<string, string>[] = [
      { type: "event", time: time(0), value: "a" },
      { type: "error", time: time(5), error: "boom" },
    ]

    const scheduler = new VirtualScheduler()
    const result = collectEvents(fromEntries(entries), scheduler)
    scheduler.advanceTo(time(100))
    result.disposable.dispose()

    expect(result.entries).toEqual(entries)
    expect(result.errored).toBe(true)
    expect(result.error).toBe("boom")
  })

  it("drops entries after a terminator", () => {
    const entries: CollectedEntry<number, never>[] = [
      { type: "event", time: time(0), value: 1 },
      { type: "end", time: time(5) },
      { type: "event", time: time(10), value: 999 },
    ]

    const scheduler = new VirtualScheduler()
    const result = collectEvents(fromEntries(entries), scheduler)
    scheduler.advanceTo(time(100))
    result.disposable.dispose()

    expect(result.values).toEqual([1])
    expect(result.ended).toBe(true)
  })

  it("preserves FIFO order for same-time entries", () => {
    const entries: CollectedEntry<string, never>[] = [
      { type: "event", time: time(10), value: "a" },
      { type: "event", time: time(10), value: "b" },
      { type: "event", time: time(10), value: "c" },
      { type: "end", time: time(10) },
    ]

    const scheduler = new VirtualScheduler()
    const result = collectEvents(fromEntries(entries), scheduler)
    scheduler.advanceTo(time(100))
    result.disposable.dispose()

    expect(result.values).toEqual(["a", "b", "c"])
  })

  it("empty entry list never emits or ends", () => {
    const scheduler = new VirtualScheduler()
    const result = collectEvents(fromEntries<number>([]), scheduler)
    scheduler.advanceTo(time(100))
    result.disposable.dispose()

    expect(result.entries).toEqual([])
    expect(result.ended).toBe(false)
  })

  it("disposing cancels pending entries", () => {
    const entries: CollectedEntry<number, never>[] = [
      { type: "event", time: time(10), value: 1 },
      { type: "event", time: time(20), value: 2 },
      { type: "end", time: time(30) },
    ]

    const scheduler = new VirtualScheduler()
    const result = collectEvents(fromEntries(entries), scheduler)
    scheduler.advanceTo(time(10))
    result.disposable.dispose()
    scheduler.advanceTo(time(100))

    expect(result.values).toEqual([1])
    expect(result.ended).toBe(false)
  })

  it("emits entries relative to subscription time (scheduler may be advanced first)", () => {
    const scheduler = new VirtualScheduler()
    scheduler.advanceTo(time(50))

    const entries: CollectedEntry<number, never>[] = [
      { type: "event", time: time(0), value: 1 },
      { type: "event", time: time(10), value: 2 },
      { type: "end", time: time(10) },
    ]

    const result = collectEvents(fromEntries(entries), scheduler)
    scheduler.advanceTo(time(200))
    result.disposable.dispose()

    expect(result.values).toEqual([1, 2])
    expect(result.entries[0]).toMatchObject({ type: "event", time: time(50), value: 1 })
    expect(result.entries[1]).toMatchObject({ type: "event", time: time(60), value: 2 })
    expect(result.ended).toBe(true)
  })

  it("throws on negative entry offsets", () => {
    const scheduler = new VirtualScheduler()
    const entries: CollectedEntry<number, never>[] = [
      { type: "event", time: toTime(-1 as unknown as number), value: 1 },
    ]
    expect(() => {
      collectEvents(fromEntries(entries), scheduler)
    }).toThrow(/negative entry offset/)
  })
})
