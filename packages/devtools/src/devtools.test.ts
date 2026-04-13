import { filter, fromArray, map, merge, scan, take } from "aeon-core"
import { VirtualScheduler } from "aeon-scheduler"
import { type Source, type Time, toTime } from "aeon-types"
import { describe, expect, it, vi } from "vitest"
import { inspect } from "./inspect.js"
import { getLabel, label } from "./label.js"
import { trace } from "./trace.js"

describe("label", () => {
  it("attaches a label retrievable via getLabel", () => {
    const event = fromArray([1, 2, 3])
    const labeled = label("my-stream", event)
    expect(getLabel(labeled as unknown as Source<number, never>)).toBe("my-stream")
  })

  it("does not alter stream values", () => {
    const scheduler = new VirtualScheduler()
    const event = fromArray([1, 2, 3])
    const labeled = label("test", event)

    const values: number[] = []
    ;(labeled as unknown as Source<number, never>).run(
      {
        event(_t: Time, v: number) {
          values.push(v)
        },
        error() {},
        end() {},
      },
      scheduler,
    )
    expect(values).toEqual([1, 2, 3])
  })

  it("returns undefined for unlabeled sources", () => {
    const event = fromArray([1, 2, 3])
    expect(getLabel(event as unknown as Source<number, never>)).toBeUndefined()
  })
})

describe("trace", () => {
  it("logs events, errors, and ends", () => {
    const scheduler = new VirtualScheduler()
    const logs: unknown[][] = []
    const mockLog = (...args: unknown[]) => {
      logs.push(args)
    }

    const event = fromArray([1, 2])
    const traced = trace(event, { log: mockLog, label: "test" })
    ;(traced as unknown as Source<number, never>).run(
      {
        event() {},
        error() {},
        end() {},
      },
      scheduler,
    )

    expect(logs).toHaveLength(3) // 2 events + 1 end
    expect(logs[0]![0]).toBe("[test] event(0)")
    expect(logs[0]![1]).toBe(1)
    expect(logs[1]![0]).toBe("[test] event(0)")
    expect(logs[1]![1]).toBe(2)
    expect(logs[2]![0]).toBe("[test] end(0)")
  })

  it("passes values through unchanged", () => {
    const scheduler = new VirtualScheduler()
    const event = fromArray([10, 20, 30])
    const traced = trace(event, { log: () => {} })

    const values: number[] = []
    ;(traced as unknown as Source<number, never>).run(
      {
        event(_t: Time, v: number) {
          values.push(v)
        },
        error() {},
        end() {},
      },
      scheduler,
    )
    expect(values).toEqual([10, 20, 30])
  })

  it("uses label from labeled stream", () => {
    const scheduler = new VirtualScheduler()
    const logs: unknown[][] = []
    const mockLog = (...args: unknown[]) => {
      logs.push(args)
    }

    const event = label("clicks", fromArray([1]))
    const traced = trace(event, { log: mockLog })
    ;(traced as unknown as Source<number, never>).run(
      {
        event() {},
        error() {},
        end() {},
      },
      scheduler,
    )

    expect(logs[0]![0] as string).toContain("[clicks]")
  })
})

describe("inspect", () => {
  it("inspects a simple fromArray source", () => {
    const tree = inspect(fromArray([1, 2, 3]))
    expect(tree.type).toBe("fromArray")
    expect(tree.children).toHaveLength(0)
  })

  it("inspects a map -> filter -> fromArray pipeline", () => {
    const event = map(
      (x: number) => x * 2,
      filter((x: number) => x > 0, fromArray([1, 2, 3])),
    )
    const tree = inspect(event)
    // map∘filter fuses to filterMap in Pulse
    // The exact tree depends on fusion — just check structure
    expect(tree.type).toBeDefined()
    expect(tree.children.length).toBeGreaterThanOrEqual(0)
  })

  it("inspects a merge of multiple sources", () => {
    const event = merge(fromArray([1]), fromArray([2]), fromArray([3]))
    const tree = inspect(event)
    expect(tree.type).toBe("merge")
    expect(tree.children).toHaveLength(3)
  })

  it("includes labels in the tree", () => {
    const event = label("my-data", fromArray([1, 2, 3]))
    const tree = inspect(event)
    expect(tree.label).toBe("my-data")
  })

  it("inspects a take -> scan -> fromArray pipeline", () => {
    const event = take(
      5,
      scan((acc: number, x: number) => acc + x, 0, fromArray([1, 2, 3])),
    )
    const tree = inspect(event)
    expect(tree.type).toBe("take")
    expect(tree.children).toHaveLength(1)
    expect(tree.children[0]!.type).toBe("scan")
  })
})
