import { VirtualScheduler } from "aeon-scheduler"
import { type Event, type Sink, type Time, toDuration, toTime } from "aeon-types"
import { describe, expect, it } from "vitest"
import { createAdapter } from "./adapter.js"
import { toAsyncIterator } from "./asyncIterator.js"
import { map } from "./combinators/map.js"
import { bufferCount, bufferTime, debounce, delay, throttle } from "./combinators/time.js"
import { empty, fromArray, now } from "./constructors.js"
import { _createEvent, _getSource } from "./internal/event.js"
import { TestScheduler } from "./internal/testScheduler.js"
import { multicast } from "./multicast.js"

// --- Helpers ---

function collectSync<A>(event: Event<A, never>, scheduler: TestScheduler | VirtualScheduler): A[] {
  const values: A[] = []
  _getSource(event).run(
    {
      event(_t: Time, v: A) {
        values.push(v)
      },
      error() {},
      end() {},
    },
    scheduler,
  )
  return values
}

// --- debounce ---

describe("debounce", () => {
  it("emits last value after quiet period", () => {
    const scheduler = new VirtualScheduler()

    let push: ((t: Time, v: number) => void) | undefined
    let endStream: ((t: Time) => void) | undefined
    const event = _createEvent<number, never>({
      run(sink) {
        push = (t, v) => sink.event(t, v)
        endStream = (t) => sink.end(t)
        return { dispose() {} }
      },
    })

    const debounced = debounce(toDuration(100), event)
    const values: number[] = []
    _getSource(debounced).run(
      {
        event(_t: Time, v: number) {
          values.push(v)
        },
        error() {},
        end() {},
      },
      scheduler,
    )

    // Rapid-fire values
    push?.(toTime(0), 1)
    push?.(toTime(30), 2)
    push?.(toTime(60), 3)

    // After 60ms, advance 100ms — the debounce timer for value 3 fires
    scheduler.advanceTo(toTime(160))
    expect(values).toEqual([3])
  })
})

// --- throttle ---

describe("throttle", () => {
  it("emits at most one value per duration", () => {
    const scheduler = new VirtualScheduler()

    let push: ((t: Time, v: number) => void) | undefined
    const event = _createEvent<number, never>({
      run(sink) {
        push = (t, v) => sink.event(t, v)
        return { dispose() {} }
      },
    })

    const throttled = throttle(toDuration(100), event)
    const values: number[] = []
    _getSource(throttled).run(
      {
        event(_t: Time, v: number) {
          values.push(v)
        },
        error() {},
        end() {},
      },
      scheduler,
    )

    push?.(toTime(0), 1) // emits (first)
    push?.(toTime(30), 2) // suppressed
    push?.(toTime(60), 3) // suppressed
    push?.(toTime(100), 4) // emits (100ms elapsed)
    push?.(toTime(150), 5) // suppressed
    push?.(toTime(200), 6) // emits

    expect(values).toEqual([1, 4, 6])
  })
})

// --- delay ---

describe("delay", () => {
  it("shifts events forward in time", () => {
    const scheduler = new VirtualScheduler()

    let push: ((t: Time, v: string) => void) | undefined
    let endStream: ((t: Time) => void) | undefined
    const event = _createEvent<string, never>({
      run(sink) {
        push = (t, v) => sink.event(t, v)
        endStream = (t) => sink.end(t)
        return { dispose() {} }
      },
    })

    const delayed = delay(toDuration(50), event)
    const values: [number, string][] = []
    let ended = false
    _getSource(delayed).run(
      {
        event(t: Time, v: string) {
          values.push([t as number, v])
        },
        error() {},
        end() {
          ended = true
        },
      },
      scheduler,
    )

    // Advance to t=10, then push "a"
    scheduler.advanceTo(toTime(10))
    push?.(toTime(10), "a")

    // Advance to t=20, then push "b"
    scheduler.advanceTo(toTime(20))
    push?.(toTime(20), "b")

    // Nothing yet — delay hasn't elapsed
    expect(values).toEqual([])

    // Advance to t=60: "a" was delayed from t=10 by 50ms → fires at t=60
    scheduler.advanceTo(toTime(60))
    expect(values).toEqual([[60, "a"]])

    // Advance to t=70: "b" was delayed from t=20 by 50ms → fires at t=70
    scheduler.advanceTo(toTime(70))
    expect(values).toEqual([
      [60, "a"],
      [70, "b"],
    ])

    // End the source, then advance past the end delay
    endStream?.(toTime(70))
    scheduler.advanceTo(toTime(120))
    expect(ended).toBe(true)
  })
})

// --- bufferCount ---

describe("bufferCount", () => {
  it("groups values into fixed-size arrays", () => {
    const scheduler = new TestScheduler()
    const result = collectSync<number[]>(
      bufferCount(3, fromArray([1, 2, 3, 4, 5, 6, 7])),
      scheduler,
    )
    expect(result).toEqual([[1, 2, 3], [4, 5, 6], [7]])
  })

  it("handles exact multiples", () => {
    const scheduler = new TestScheduler()
    const result = collectSync<number[]>(bufferCount(2, fromArray([1, 2, 3, 4])), scheduler)
    expect(result).toEqual([
      [1, 2],
      [3, 4],
    ])
  })
})

// --- createAdapter ---

describe("createAdapter", () => {
  it("pushes values to subscribers", () => {
    const scheduler = new TestScheduler()
    const [push, event] = createAdapter<number>()
    const values: number[] = []

    _getSource(event).run(
      {
        event(_t: Time, v: number) {
          values.push(v)
        },
        error() {},
        end() {},
      },
      scheduler,
    )

    push(1)
    push(2)
    push(3)
    expect(values).toEqual([1, 2, 3])
  })

  it("supports multiple subscribers", () => {
    const scheduler = new TestScheduler()
    const [push, event] = createAdapter<number>()
    const a: number[] = []
    const b: number[] = []

    _getSource(event).run(
      {
        event(_t: Time, v: number) {
          a.push(v)
        },
        error() {},
        end() {},
      },
      scheduler,
    )
    _getSource(event).run(
      {
        event(_t: Time, v: number) {
          b.push(v)
        },
        error() {},
        end() {},
      },
      scheduler,
    )

    push(42)
    expect(a).toEqual([42])
    expect(b).toEqual([42])
  })

  it("unsubscribes cleanly", () => {
    const scheduler = new TestScheduler()
    const [push, event] = createAdapter<number>()
    const values: number[] = []

    const d = _getSource(event).run(
      {
        event(_t: Time, v: number) {
          values.push(v)
        },
        error() {},
        end() {},
      },
      scheduler,
    )

    push(1)
    d.dispose()
    push(2)
    expect(values).toEqual([1])
  })
})

// --- multicast ---

describe("multicast", () => {
  it("shares a single subscription", () => {
    let subscribeCount = 0
    const source = _createEvent<number, never>({
      run(sink, scheduler) {
        subscribeCount++
        sink.event(scheduler.currentTime(), 42)
        sink.end(scheduler.currentTime())
        return { dispose() {} }
      },
    })

    const shared = multicast(source)
    const scheduler = new TestScheduler()
    const a: number[] = []
    const b: number[] = []

    _getSource(shared).run(
      {
        event(_t: Time, v: number) {
          a.push(v)
        },
        error() {},
        end() {},
      },
      scheduler,
    )
    _getSource(shared).run(
      {
        event(_t: Time, v: number) {
          b.push(v)
        },
        error() {},
        end() {},
      },
      scheduler,
    )

    // Source should only be subscribed once
    expect(subscribeCount).toBe(1)
    expect(a).toEqual([42])
    // Second subscriber gets end immediately since source already ended
  })

  it("disposes source when last subscriber leaves", () => {
    let disposed = false
    const source = _createEvent<number, never>({
      run() {
        return {
          dispose() {
            disposed = true
          },
        }
      },
    })

    const shared = multicast(source)
    const scheduler = new TestScheduler()

    const d1 = _getSource(shared).run({ event() {}, error() {}, end() {} }, scheduler)
    const d2 = _getSource(shared).run({ event() {}, error() {}, end() {} }, scheduler)

    expect(disposed).toBe(false)
    d1.dispose()
    expect(disposed).toBe(false)
    d2.dispose()
    expect(disposed).toBe(true)
  })
})

// --- toAsyncIterator ---

describe("toAsyncIterator", () => {
  it("iterates over synchronous events", async () => {
    const scheduler = new TestScheduler()
    const iter = toAsyncIterator(fromArray([1, 2, 3]), scheduler)

    const r1 = await iter.next()
    expect(r1).toEqual({ value: 1, done: false })

    const r2 = await iter.next()
    expect(r2).toEqual({ value: 2, done: false })

    const r3 = await iter.next()
    expect(r3).toEqual({ value: 3, done: false })

    const r4 = await iter.next()
    expect(r4.done).toBe(true)
  })

  it("can be disposed early", async () => {
    const scheduler = new TestScheduler()
    const iter = toAsyncIterator(fromArray([1, 2, 3, 4, 5]), scheduler)

    await iter.next() // 1
    await iter.next() // 2
    const ret = await iter.return!()
    expect(ret.done).toBe(true)
  })
})
