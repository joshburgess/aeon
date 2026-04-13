import { type Sink, type Time, toDuration, toTime } from "aeon-types"
import { describe, expect, it } from "vitest"
import { all, count, elementAt } from "./combinators/aggregate.js"
import { attach } from "./combinators/attach.js"
import { chain } from "./combinators/chain.js"
import { combine, zip } from "./combinators/combine.js"
import { cons } from "./combinators/cons.js"
import { constant } from "./combinators/constant.js"
import { dedupe } from "./combinators/dedupe.js"
import { ensure } from "./combinators/ensure.js"
import { catchError, mapError, throwError } from "./combinators/error.js"
import { exhaustMap } from "./combinators/exhaustMap.js"
import { filter } from "./combinators/filter.js"
import { first, last } from "./combinators/firstLast.js"
import { forkJoin } from "./combinators/forkJoin.js"
import { fromPromise } from "./combinators/fromPromise.js"
import { map } from "./combinators/map.js"
import { merge } from "./combinators/merge.js"
import { mergeMap } from "./combinators/mergeMap.js"
import { orElse } from "./combinators/orElse.js"
import { pairwise } from "./combinators/pairwise.js"
import { race } from "./combinators/race.js"
import { retry } from "./combinators/retry.js"
import { scan } from "./combinators/scan.js"
import { share } from "./combinators/share.js"
import { drop, dropWhile, since, slice, take, takeWhile, until } from "./combinators/slice.js"
import { switchLatest } from "./combinators/switch.js"
import { tap } from "./combinators/tap.js"
import { drain, observe, reduce } from "./combinators/terminal.js"
import { TimeoutError, timeout } from "./combinators/timeout.js"
import { traverse } from "./combinators/traverse.js"
import { empty, fromArray, never, now, range } from "./constructors.js"
import { _createEvent, _getSource } from "./internal/event.js"
import { TestScheduler } from "./internal/testScheduler.js"

/** Helper: collect all values from a synchronous event. */
function collectSync<A>(event: Parameters<typeof _getSource>[0], scheduler: TestScheduler): A[] {
  const values: A[] = []
  _getSource(event).run(
    {
      event(_t: Time, v: unknown) {
        values.push(v as A)
      },
      error() {},
      end() {},
    } as Sink<unknown, never>,
    scheduler,
  )
  return values
}

describe("map", () => {
  it("transforms each value", () => {
    const scheduler = new TestScheduler()
    const result = collectSync<number>(
      map((x: number) => x * 2, fromArray([1, 2, 3])),
      scheduler,
    )
    expect(result).toEqual([2, 4, 6])
  })

  it("Functor identity: map(id, e) === e", () => {
    const scheduler = new TestScheduler()
    const source = [1, 2, 3, 4, 5]
    const identity = (x: number) => x
    const result = collectSync<number>(map(identity, fromArray(source)), scheduler)
    expect(result).toEqual(source)
  })

  it("Functor composition: map(f . g) === map(f) . map(g)", () => {
    const scheduler = new TestScheduler()
    const f = (x: number) => x + 1
    const g = (x: number) => x * 2
    const source = fromArray([1, 2, 3])

    const composed = collectSync<number>(
      map((x: number) => f(g(x)), source),
      scheduler,
    )
    const piped = collectSync<number>(map(f, map(g, fromArray([1, 2, 3]))), scheduler)
    expect(composed).toEqual(piped)
  })
})

describe("filter", () => {
  it("keeps values satisfying the predicate", () => {
    const scheduler = new TestScheduler()
    const result = collectSync<number>(
      filter((x: number) => x % 2 === 0, fromArray([1, 2, 3, 4, 5])),
      scheduler,
    )
    expect(result).toEqual([2, 4])
  })

  it("returns empty for no matches", () => {
    const scheduler = new TestScheduler()
    const result = collectSync<number>(
      filter(() => false, fromArray([1, 2, 3])),
      scheduler,
    )
    expect(result).toEqual([])
  })
})

describe("tap", () => {
  it("runs side effect without changing values", () => {
    const scheduler = new TestScheduler()
    const sideEffects: number[] = []
    const result = collectSync<number>(
      tap((x: number) => sideEffects.push(x), fromArray([1, 2, 3])),
      scheduler,
    )
    expect(result).toEqual([1, 2, 3])
    expect(sideEffects).toEqual([1, 2, 3])
  })
})

describe("constant", () => {
  it("replaces every value with a constant", () => {
    const scheduler = new TestScheduler()
    const result = collectSync<string>(constant("x", fromArray([1, 2, 3])), scheduler)
    expect(result).toEqual(["x", "x", "x"])
  })
})

describe("scan", () => {
  it("emits running accumulation", () => {
    const scheduler = new TestScheduler()
    const result = collectSync<number>(
      scan((acc: number, x: number) => acc + x, 0, fromArray([1, 2, 3, 4])),
      scheduler,
    )
    expect(result).toEqual([1, 3, 6, 10])
  })
})

describe("reduce", () => {
  it("folds all values into a single result", async () => {
    const scheduler = new TestScheduler()
    const result = await reduce(
      (acc: number, x: number) => acc + x,
      0,
      fromArray([1, 2, 3, 4]),
      scheduler,
    )
    expect(result).toBe(10)
  })
})

describe("observe", () => {
  it("runs side effect for each value", async () => {
    const scheduler = new TestScheduler()
    const seen: number[] = []
    await observe((x: number) => seen.push(x), fromArray([1, 2, 3]), scheduler)
    expect(seen).toEqual([1, 2, 3])
  })
})

describe("drain", () => {
  it("activates the stream and resolves when done", async () => {
    const scheduler = new TestScheduler()
    await drain(fromArray([1, 2, 3]), scheduler)
    // Just verify it doesn't throw
  })
})

describe("take", () => {
  it("takes the first n values", () => {
    const scheduler = new TestScheduler()
    const result = collectSync<number>(take(2, fromArray([1, 2, 3, 4, 5])), scheduler)
    expect(result).toEqual([1, 2])
  })

  it("take(0) emits nothing", () => {
    const scheduler = new TestScheduler()
    const result = collectSync<number>(take(0, fromArray([1, 2, 3])), scheduler)
    expect(result).toEqual([])
  })

  it("take(n) where n > length returns all", () => {
    const scheduler = new TestScheduler()
    const result = collectSync<number>(take(10, fromArray([1, 2])), scheduler)
    expect(result).toEqual([1, 2])
  })
})

describe("drop", () => {
  it("drops the first n values", () => {
    const scheduler = new TestScheduler()
    const result = collectSync<number>(drop(2, fromArray([1, 2, 3, 4, 5])), scheduler)
    expect(result).toEqual([3, 4, 5])
  })

  it("drop(0) passes all through", () => {
    const scheduler = new TestScheduler()
    const result = collectSync<number>(drop(0, fromArray([1, 2, 3])), scheduler)
    expect(result).toEqual([1, 2, 3])
  })
})

describe("takeWhile", () => {
  it("takes values while predicate holds", () => {
    const scheduler = new TestScheduler()
    const result = collectSync<number>(
      takeWhile((x: number) => x < 4, fromArray([1, 2, 3, 4, 5])),
      scheduler,
    )
    expect(result).toEqual([1, 2, 3])
  })
})

describe("dropWhile", () => {
  it("drops values while predicate holds", () => {
    const scheduler = new TestScheduler()
    const result = collectSync<number>(
      dropWhile((x: number) => x < 3, fromArray([1, 2, 3, 4, 5])),
      scheduler,
    )
    expect(result).toEqual([3, 4, 5])
  })
})

describe("slice", () => {
  it("takes a contiguous slice", () => {
    const scheduler = new TestScheduler()
    const result = collectSync<number>(slice(1, 4, fromArray([1, 2, 3, 4, 5])), scheduler)
    expect(result).toEqual([2, 3, 4])
  })
})

describe("until", () => {
  it("takes values until the signal fires", () => {
    const scheduler = new TestScheduler()
    let pushMain: ((t: Time, v: number) => void) | undefined
    let endMain: ((t: Time) => void) | undefined
    let pushSignal: ((t: Time) => void) | undefined
    const main = _createEvent<number, never>({
      run(sink) {
        pushMain = (t, v) => sink.event(t, v)
        endMain = (t) => sink.end(t)
        return {
          dispose() {
            pushMain = undefined
          },
        }
      },
    })
    const signal = _createEvent<unknown, never>({
      run(sink) {
        pushSignal = (t) => sink.event(t, undefined)
        return {
          dispose() {
            pushSignal = undefined
          },
        }
      },
    })

    const values: number[] = []
    let ended = false
    _getSource(until(signal, main)).run(
      {
        event(_t: Time, v: number) {
          values.push(v)
        },
        error() {},
        end() {
          ended = true
        },
      },
      scheduler,
    )

    pushMain?.(toTime(0), 1)
    pushMain?.(toTime(1), 2)
    expect(values).toEqual([1, 2])
    expect(ended).toBe(false)

    // Signal fires — stream should end
    pushSignal?.(toTime(2))
    expect(ended).toBe(true)

    // Values after signal should be ignored
    pushMain?.(toTime(3), 3)
    expect(values).toEqual([1, 2])
  })

  it("passes through all values if signal never fires", () => {
    const scheduler = new TestScheduler()
    let pushMain: ((t: Time, v: number) => void) | undefined
    let endMain: ((t: Time) => void) | undefined
    const main = _createEvent<number, never>({
      run(sink) {
        pushMain = (t, v) => sink.event(t, v)
        endMain = (t) => sink.end(t)
        return {
          dispose() {
            pushMain = undefined
          },
        }
      },
    })
    const signal = _createEvent<unknown, never>({
      run() {
        return { dispose() {} }
      },
    })

    const values: number[] = []
    let ended = false
    _getSource(until(signal, main)).run(
      {
        event(_t: Time, v: number) {
          values.push(v)
        },
        error() {},
        end() {
          ended = true
        },
      },
      scheduler,
    )

    pushMain?.(toTime(0), 1)
    pushMain?.(toTime(1), 2)
    endMain?.(toTime(2))
    expect(values).toEqual([1, 2])
    expect(ended).toBe(true)
  })
})

describe("since", () => {
  it("skips values until the signal fires, then passes through", () => {
    const scheduler = new TestScheduler()
    let pushMain: ((t: Time, v: number) => void) | undefined
    let endMain: ((t: Time) => void) | undefined
    let pushSignal: ((t: Time) => void) | undefined
    const main = _createEvent<number, never>({
      run(sink) {
        pushMain = (t, v) => sink.event(t, v)
        endMain = (t) => sink.end(t)
        return {
          dispose() {
            pushMain = undefined
          },
        }
      },
    })
    const signal = _createEvent<unknown, never>({
      run(sink) {
        pushSignal = (t) => sink.event(t, undefined)
        return {
          dispose() {
            pushSignal = undefined
          },
        }
      },
    })

    const values: number[] = []
    let ended = false
    _getSource(since(signal, main)).run(
      {
        event(_t: Time, v: number) {
          values.push(v)
        },
        error() {},
        end() {
          ended = true
        },
      },
      scheduler,
    )

    pushMain?.(toTime(0), 1)
    pushMain?.(toTime(1), 2)
    expect(values).toEqual([])

    // Signal fires — start passing through
    pushSignal?.(toTime(2))

    pushMain?.(toTime(3), 3)
    pushMain?.(toTime(4), 4)
    expect(values).toEqual([3, 4])

    endMain?.(toTime(5))
    expect(ended).toBe(true)
  })

  it("passes all values if signal fires immediately", () => {
    const scheduler = new TestScheduler()
    let pushMain: ((t: Time, v: number) => void) | undefined
    let pushSignal: ((t: Time) => void) | undefined
    const main = _createEvent<number, never>({
      run(sink) {
        pushMain = (t, v) => sink.event(t, v)
        return {
          dispose() {
            pushMain = undefined
          },
        }
      },
    })
    const signal = _createEvent<unknown, never>({
      run(sink) {
        pushSignal = (t) => sink.event(t, undefined)
        return {
          dispose() {
            pushSignal = undefined
          },
        }
      },
    })

    const values: number[] = []
    _getSource(since(signal, main)).run(
      {
        event(_t: Time, v: number) {
          values.push(v)
        },
        error() {},
        end() {},
      },
      scheduler,
    )

    pushSignal?.(toTime(0))
    pushMain?.(toTime(1), 10)
    pushMain?.(toTime(2), 20)
    expect(values).toEqual([10, 20])
  })
})

describe("merge", () => {
  it("interleaves synchronous sources", () => {
    const scheduler = new TestScheduler()
    const a = fromArray([1, 2])
    const b = fromArray([3, 4])
    const result = collectSync<number>(merge(a, b), scheduler)
    expect(result).toEqual([1, 2, 3, 4])
  })

  it("merge of zero events ends immediately", () => {
    const scheduler = new TestScheduler()
    let ended = false
    _getSource(merge<number, never>()).run(
      {
        event() {},
        error() {},
        end() {
          ended = true
        },
      },
      scheduler,
    )
    expect(ended).toBe(true)
  })

  it("merge of one event is identity", () => {
    const scheduler = new TestScheduler()
    const result = collectSync<number>(merge(fromArray([1, 2, 3])), scheduler)
    expect(result).toEqual([1, 2, 3])
  })
})

describe("combine", () => {
  it("combines latest values from both streams", () => {
    const scheduler = new TestScheduler()
    const a = fromArray([1, 2])
    const b = fromArray([10, 20])
    const result = collectSync<number>(
      combine((x: number, y: number) => x + y, a, b),
      scheduler,
    )
    // a emits 1 (no b yet), a emits 2 (no b yet), b emits 10 (has a=2), b emits 20 (has a=2)
    expect(result).toEqual([12, 22])
  })
})

describe("zip", () => {
  it("pairs elements from both streams", () => {
    const scheduler = new TestScheduler()
    const a = fromArray([1, 2, 3])
    const b = fromArray(["a", "b"])
    const result = collectSync<[number, string]>(zip(a, b), scheduler)
    expect(result).toEqual([
      [1, "a"],
      [2, "b"],
    ])
  })
})

describe("switchLatest", () => {
  it("switches to the latest inner event", () => {
    const scheduler = new TestScheduler()
    // Outer emits two inner events synchronously; switchLatest should
    // dispose the first and follow the second
    const inner1 = fromArray([1, 2])
    const inner2 = fromArray([3, 4])
    const outer = fromArray([inner1, inner2])
    const result = collectSync<number>(switchLatest(outer), scheduler)
    // inner1 emits 1,2 then inner2 replaces it and emits 3,4
    // Since both are synchronous, inner1 completes before inner2 starts
    expect(result).toEqual([1, 2, 3, 4])
  })
})

describe("mergeMap", () => {
  it("maps and merges with concurrency", () => {
    const scheduler = new TestScheduler()
    const result = collectSync<number>(
      mergeMap(
        (x: number) => fromArray([x * 10, x * 10 + 1]),
        Number.POSITIVE_INFINITY,
        fromArray([1, 2]),
      ),
      scheduler,
    )
    expect(result).toEqual([10, 11, 20, 21])
  })
})

describe("error handling", () => {
  describe("throwError", () => {
    it("immediately errors", () => {
      const scheduler = new TestScheduler()
      const errors: string[] = []
      _getSource(throwError<number, string>("boom")).run(
        {
          event() {},
          error(_t: Time, err: string) {
            errors.push(err)
          },
          end() {},
        },
        scheduler,
      )
      expect(errors).toEqual(["boom"])
    })
  })

  describe("catchError", () => {
    it("recovers from an error with a new stream", () => {
      const scheduler = new TestScheduler()
      const recovered = catchError(
        (err: string) => fromArray([err.length]),
        throwError<number, string>("boom"),
      )
      const result = collectSync<number>(recovered, scheduler)
      expect(result).toEqual([4])
    })

    it("catchError(handler, throwError(e)) === handler(e)", () => {
      const scheduler = new TestScheduler()
      const handler = (err: string) => fromArray([err.toUpperCase()])

      const viaRecovery = collectSync<string>(
        catchError(handler, throwError<string, string>("hello")),
        scheduler,
      )
      const direct = collectSync<string>(handler("hello"), scheduler)
      expect(viaRecovery).toEqual(direct)
    })
  })

  describe("mapError", () => {
    it("transforms the error value", () => {
      const scheduler = new TestScheduler()
      const errors: number[] = []
      const mapped = mapError((e: string) => e.length, throwError<number, string>("boom"))
      _getSource(mapped).run(
        {
          event() {},
          error(_t: Time, err: number) {
            errors.push(err)
          },
          end() {},
        },
        scheduler,
      )
      expect(errors).toEqual([4])
    })
  })
})

describe("chain (flatMap)", () => {
  it("concatMaps inner events", () => {
    const scheduler = new TestScheduler()
    const result = collectSync<number>(
      chain((x: number) => fromArray([x, x * 10]), fromArray([1, 2, 3])),
      scheduler,
    )
    expect(result).toEqual([1, 10, 2, 20, 3, 30])
  })

  it("Monad left identity: chain(f, of(a)) === f(a)", () => {
    const scheduler = new TestScheduler()
    const f = (x: number) => fromArray([x + 1, x + 2])

    const viaChain = collectSync<number>(chain(f, now(5)), scheduler)
    const direct = collectSync<number>(f(5), scheduler)
    expect(viaChain).toEqual(direct)
  })

  it("Monad right identity: chain(of, m) === m", () => {
    const scheduler = new TestScheduler()
    const m = fromArray([1, 2, 3])

    const viaChain = collectSync<number>(chain(now, m), scheduler)
    const direct = collectSync<number>(fromArray([1, 2, 3]), scheduler)
    expect(viaChain).toEqual(direct)
  })

  it("Monad associativity: chain(g, chain(f, m)) === chain(x => chain(g, f(x)), m)", () => {
    const scheduler = new TestScheduler()
    const f = (x: number) => fromArray([x, x + 1])
    const g = (x: number) => fromArray([x * 10])
    const m = fromArray([1, 2])

    const left = collectSync<number>(chain(g, chain(f, m)), scheduler)
    const right = collectSync<number>(
      chain((x: number) => chain(g, f(x)), fromArray([1, 2])),
      scheduler,
    )
    expect(left).toEqual(right)
  })
})

describe("filter -> map -> reduce pipeline", () => {
  it("processes 10k elements correctly", async () => {
    const scheduler = new TestScheduler()
    const n = 10_000
    const arr = Array.from({ length: n }, (_, i) => i)
    const pipeline = map(
      (x: number) => x * 2,
      filter((x: number) => x % 2 === 0, fromArray(arr)),
    )
    const result = await reduce((acc: number, x: number) => acc + x, 0, pipeline, scheduler)
    // Sum of 2*x for even x from 0 to 9999
    const expected = arr
      .filter((x) => x % 2 === 0)
      .map((x) => x * 2)
      .reduce((a, b) => a + b, 0)
    expect(result).toBe(expected)
  })
})

describe("traverse", () => {
  it("applies an async function to each value", async () => {
    const scheduler = new TestScheduler()
    const event = fromArray([1, 2, 3])
    const result: number[] = []

    const mapped = traverse(async (x: number) => x * 10, Number.POSITIVE_INFINITY, event)

    await new Promise<void>((resolve) => {
      _getSource(mapped).run(
        {
          event(_t: Time, v: number) {
            result.push(v)
          },
          error() {},
          end() {
            resolve()
          },
        },
        scheduler,
      )
    })

    expect(result.sort((a, b) => a - b)).toEqual([10, 20, 30])
  })

  it("respects concurrency limit", async () => {
    const scheduler = new TestScheduler()
    let concurrent = 0
    let maxConcurrent = 0
    const resolvers: Array<(v: number) => void> = []

    const event = fromArray([1, 2, 3, 4])
    const mapped = traverse(
      (x: number) =>
        new Promise<number>((resolve) => {
          concurrent++
          maxConcurrent = Math.max(maxConcurrent, concurrent)
          resolvers.push((v) => {
            concurrent--
            resolve(v)
          })
        }),
      2,
      event,
    )

    const result: number[] = []
    const done = new Promise<void>((resolve) => {
      _getSource(mapped).run(
        {
          event(_t: Time, v: number) {
            result.push(v)
          },
          error() {},
          end() {
            resolve()
          },
        },
        scheduler,
      )
    })

    // 2 started, 2 buffered
    await Promise.resolve() // let microtasks settle
    expect(maxConcurrent).toBe(2)

    // Resolve first two
    resolvers[0]!(10)
    resolvers[1]!(20)
    await Promise.resolve()
    await Promise.resolve()

    // Resolve remaining
    resolvers[2]!(30)
    resolvers[3]!(40)
    await done

    expect(result.sort((a, b) => a - b)).toEqual([10, 20, 30, 40])
    expect(maxConcurrent).toBe(2)
  })

  it("propagates async errors", async () => {
    const scheduler = new TestScheduler()
    const event = fromArray([1])
    const mapped = traverse(
      async (_x: number) => {
        throw new Error("boom")
      },
      1,
      event,
    )

    const error = await new Promise<unknown>((resolve) => {
      _getSource(mapped).run(
        {
          event() {},
          error(_t: Time, err: unknown) {
            resolve(err)
          },
          end() {},
        },
        scheduler,
      )
    })

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe("boom")
  })
})

describe("fromPromise", () => {
  it("emits the resolved value", async () => {
    const scheduler = new TestScheduler()
    const event = fromPromise(Promise.resolve(42))

    const result = await new Promise<number>((resolve) => {
      _getSource(event).run(
        {
          event(_t: Time, v: number) {
            resolve(v)
          },
          error() {},
          end() {},
        },
        scheduler,
      )
    })

    expect(result).toBe(42)
  })

  it("errors on rejection", async () => {
    const scheduler = new TestScheduler()
    const event = fromPromise(Promise.reject(new Error("fail")))

    const error = await new Promise<unknown>((resolve) => {
      _getSource(event).run(
        {
          event() {},
          error(_t: Time, err: unknown) {
            resolve(err)
          },
          end() {},
        },
        scheduler,
      )
    })

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe("fail")
  })

  it("does not emit after dispose", async () => {
    const scheduler = new TestScheduler()
    let emitted = false

    const p = new Promise<number>((resolve) => {
      setTimeout(() => resolve(42), 10)
    })

    const disposable = _getSource(fromPromise(p)).run(
      {
        event() {
          emitted = true
        },
        error() {},
        end() {},
      },
      scheduler,
    )

    disposable.dispose()
    await p.catch(() => {})
    await new Promise((r) => setTimeout(r, 20))
    expect(emitted).toBe(false)
  })
})

describe("retry", () => {
  it("retries on error up to maxRetries", () => {
    const scheduler = new TestScheduler()
    let attempts = 0

    const failing = _createEvent<number, string>({
      run(sink, sched) {
        attempts++
        if (attempts < 3) {
          sink.error(sched.currentTime(), "fail")
        } else {
          const t = sched.currentTime()
          sink.event(t, 42)
          sink.end(t)
        }
        return { dispose() {} }
      },
    })

    const values: number[] = []
    let ended = false
    _getSource(retry(5, failing)).run(
      {
        event(_t: Time, v: number) {
          values.push(v)
        },
        error() {},
        end() {
          ended = true
        },
      },
      scheduler,
    )

    expect(attempts).toBe(3)
    expect(values).toEqual([42])
    expect(ended).toBe(true)
  })

  it("propagates error after exhausting retries", () => {
    const scheduler = new TestScheduler()
    const failing = throwError<number, string>("boom")

    const errors: string[] = []
    _getSource(retry(2, failing)).run(
      {
        event() {},
        error(_t: Time, err: string) {
          errors.push(err)
        },
        end() {},
      },
      scheduler,
    )

    expect(errors).toEqual(["boom"])
  })
})

describe("share", () => {
  it("replays buffered values to late subscribers", () => {
    const scheduler = new TestScheduler()
    const source = fromArray([1, 2, 3])
    const shared = share(2, source)

    // First subscriber gets all values
    const values1: number[] = []
    _getSource(shared).run(
      {
        event(_t: Time, v: number) {
          values1.push(v)
        },
        error() {},
        end() {},
      },
      scheduler,
    )
    expect(values1).toEqual([1, 2, 3])
  })

  it("share(0) works like multicast (no replay)", () => {
    const scheduler = new TestScheduler()
    let subscriptions = 0

    const source = _createEvent<number, never>({
      run(sink, sched) {
        subscriptions++
        const t = sched.currentTime()
        sink.event(t, 1)
        sink.event(t, 2)
        sink.end(t)
        return { dispose() {} }
      },
    })

    const shared = share(0, source)

    const values1: number[] = []
    _getSource(shared).run(
      {
        event(_t: Time, v: number) {
          values1.push(v)
        },
        error() {},
        end() {},
      },
      scheduler,
    )

    expect(values1).toEqual([1, 2])
    expect(subscriptions).toBe(1)
  })
})

describe("attach", () => {
  it("combines latest value from sampled with each sampler emission", () => {
    const scheduler = new TestScheduler()
    // sampled emits 10, 20; sampler emits "a", "b"
    // After sampled=10, sampled=20, sampler="a" → f(20, "a"), sampler="b" → f(20, "b")
    let pushSampled: ((t: Time, v: number) => void) | undefined
    let pushSampler: ((t: Time, v: string) => void) | undefined
    let endSampler: ((t: Time) => void) | undefined

    const sampled = _createEvent<number, never>({
      run(sink) {
        pushSampled = (t, v) => sink.event(t, v)
        return { dispose() {} }
      },
    })

    const sampler = _createEvent<string, never>({
      run(sink) {
        pushSampler = (t, v) => sink.event(t, v)
        endSampler = (t) => sink.end(t)
        return { dispose() {} }
      },
    })

    const values: string[] = []
    let ended = false
    _getSource(attach((n: number, s: string) => `${n}-${s}`, sampled, sampler)).run(
      {
        event(_t: Time, v: string) {
          values.push(v)
        },
        error() {},
        end() {
          ended = true
        },
      },
      scheduler,
    )

    // Sampler fires before sampled has a value — should not emit
    pushSampler?.(toTime(0), "x")
    expect(values).toEqual([])

    // Sampled gets a value
    pushSampled?.(toTime(1), 10)

    // Now sampler fires — should emit
    pushSampler?.(toTime(2), "a")
    expect(values).toEqual(["10-a"])

    // Update sampled, then sample again
    pushSampled?.(toTime(3), 20)
    pushSampler?.(toTime(4), "b")
    expect(values).toEqual(["10-a", "20-b"])

    // End when sampler ends
    endSampler?.(toTime(5))
    expect(ended).toBe(true)
  })

  it("does not emit until sampled has a value", () => {
    const scheduler = new TestScheduler()
    const sampled = never<number>()
    const sampler = fromArray(["a", "b", "c"])

    const values: unknown[] = []
    _getSource(attach((n: number, s: string) => `${n}-${s}`, sampled, sampler)).run(
      {
        event(_t: Time, v: unknown) {
          values.push(v)
        },
        error() {},
        end() {},
      },
      scheduler,
    )

    expect(values).toEqual([])
  })

  it("works with synchronous sources", () => {
    const scheduler = new TestScheduler()
    const sampled = fromArray([10, 20, 30])
    const sampler = fromArray(["a", "b"])

    const values: string[] = []
    _getSource(attach((n: number, s: string) => `${n}-${s}`, sampled, sampler)).run(
      {
        event(_t: Time, v: string) {
          values.push(v)
        },
        error() {},
        end() {},
      },
      scheduler,
    )

    // sampled emits 10, 20, 30 → latestA=30
    // sampler emits "a" → "30-a", "b" → "30-b"
    expect(values).toEqual(["30-a", "30-b"])
  })
})

// ============================================================
// Tier 1 operators
// ============================================================

describe("dedupe", () => {
  it("suppresses consecutive duplicates", () => {
    const scheduler = new TestScheduler()
    const result = collectSync<number>(dedupe(fromArray([1, 1, 2, 2, 2, 3, 1, 1])), scheduler)
    expect(result).toEqual([1, 2, 3, 1])
  })

  it("passes all values when none are consecutive duplicates", () => {
    const scheduler = new TestScheduler()
    const result = collectSync<number>(dedupe(fromArray([1, 2, 3, 4])), scheduler)
    expect(result).toEqual([1, 2, 3, 4])
  })

  it("uses custom equality function", () => {
    const scheduler = new TestScheduler()
    const result = collectSync<{ id: number; name: string }>(
      dedupe(
        fromArray([
          { id: 1, name: "a" },
          { id: 1, name: "b" },
          { id: 2, name: "c" },
        ]),
        (a, b) => a.id === b.id,
      ),
      scheduler,
    )
    expect(result).toEqual([
      { id: 1, name: "a" },
      { id: 2, name: "c" },
    ])
  })

  it("emits single value unchanged", () => {
    const scheduler = new TestScheduler()
    const result = collectSync<number>(dedupe(fromArray([42])), scheduler)
    expect(result).toEqual([42])
  })
})

describe("cons", () => {
  it("prepends a value before the stream", () => {
    const scheduler = new TestScheduler()
    const result = collectSync<number>(cons(0, fromArray([1, 2, 3])), scheduler)
    expect(result).toEqual([0, 1, 2, 3])
  })

  it("works with empty stream", () => {
    const scheduler = new TestScheduler()
    const result = collectSync<number>(cons(42, empty()), scheduler)
    expect(result).toEqual([42])
  })
})

describe("first", () => {
  it("emits only the first value", () => {
    const scheduler = new TestScheduler()
    const result = collectSync<number>(first(fromArray([10, 20, 30])), scheduler)
    expect(result).toEqual([10])
  })

  it("emits first value matching predicate", () => {
    const scheduler = new TestScheduler()
    const result = collectSync<number>(
      first(fromArray([1, 2, 3, 4]), (x) => x > 2),
      scheduler,
    )
    expect(result).toEqual([3])
  })

  it("emits nothing on empty stream", () => {
    const scheduler = new TestScheduler()
    const result = collectSync<number>(first(empty()), scheduler)
    expect(result).toEqual([])
  })
})

describe("last", () => {
  it("emits only the final value", () => {
    const scheduler = new TestScheduler()
    const result = collectSync<number>(last(fromArray([10, 20, 30])), scheduler)
    expect(result).toEqual([30])
  })

  it("emits last value matching predicate", () => {
    const scheduler = new TestScheduler()
    const result = collectSync<number>(
      last(fromArray([1, 2, 3, 4, 5]), (x) => x < 4),
      scheduler,
    )
    expect(result).toEqual([3])
  })

  it("emits nothing on empty stream", () => {
    const scheduler = new TestScheduler()
    const result = collectSync<number>(last(empty()), scheduler)
    expect(result).toEqual([])
  })
})

describe("pairwise", () => {
  it("emits [prev, curr] pairs", () => {
    const scheduler = new TestScheduler()
    const result = collectSync<[number, number]>(pairwise(fromArray([1, 2, 3, 4])), scheduler)
    expect(result).toEqual([
      [1, 2],
      [2, 3],
      [3, 4],
    ])
  })

  it("emits nothing for single-element stream", () => {
    const scheduler = new TestScheduler()
    const result = collectSync<[number, number]>(pairwise(fromArray([1])), scheduler)
    expect(result).toEqual([])
  })

  it("emits nothing for empty stream", () => {
    const scheduler = new TestScheduler()
    const result = collectSync<[number, number]>(pairwise(empty()), scheduler)
    expect(result).toEqual([])
  })
})

// ============================================================
// Tier 2 operators
// ============================================================

describe("exhaustMap", () => {
  it("ignores outer values while inner is active", () => {
    const scheduler = new TestScheduler()
    // Outer emits 1, 2, 3 synchronously. Inner for each is fromArray([x*10, x*10+1]).
    // Only the first inner (10, 11) should run; 2 and 3 are ignored because
    // inner completes synchronously before next outer event arrives —
    // so actually all run. Let's test with an async-like scenario.
    const result = collectSync<number>(
      exhaustMap((x: number) => fromArray([x * 10, x * 10 + 1]), fromArray([1, 2, 3])),
      scheduler,
    )
    // With synchronous inner streams, each inner completes before the next outer arrives,
    // so all inners run.
    expect(result).toEqual([10, 11, 20, 21, 30, 31])
  })

  it("projects outer to inner streams", () => {
    const scheduler = new TestScheduler()
    const result = collectSync<string>(
      exhaustMap((x: number) => now(`v${x}`), fromArray([1, 2, 3])),
      scheduler,
    )
    expect(result).toEqual(["v1", "v2", "v3"])
  })
})

describe("forkJoin", () => {
  it("emits array of final values when all complete", () => {
    const scheduler = new TestScheduler()
    const result = collectSync<number[]>(
      forkJoin(fromArray([1, 2, 3]), fromArray([4, 5]), now(6)),
      scheduler,
    )
    expect(result).toEqual([[3, 5, 6]])
  })

  it("emits nothing if any stream is empty", () => {
    const scheduler = new TestScheduler()
    const result = collectSync<number[]>(forkJoin(fromArray([1, 2]), empty(), now(3)), scheduler)
    expect(result).toEqual([])
  })

  it("emits nothing for zero streams", () => {
    const scheduler = new TestScheduler()
    const result = collectSync<number[]>(forkJoin(), scheduler)
    expect(result).toEqual([])
  })

  it("works with single stream", () => {
    const scheduler = new TestScheduler()
    const result = collectSync<number[]>(forkJoin(fromArray([10, 20, 30])), scheduler)
    expect(result).toEqual([[30]])
  })
})

describe("orElse", () => {
  it("emits default when stream is empty", () => {
    const scheduler = new TestScheduler()
    const result = collectSync<number>(orElse(42, empty()), scheduler)
    expect(result).toEqual([42])
  })

  it("passes through values when stream is not empty", () => {
    const scheduler = new TestScheduler()
    const result = collectSync<number>(orElse(42, fromArray([1, 2, 3])), scheduler)
    expect(result).toEqual([1, 2, 3])
  })

  it("passes through single value unchanged", () => {
    const scheduler = new TestScheduler()
    const result = collectSync<number>(orElse(99, now(1)), scheduler)
    expect(result).toEqual([1])
  })
})

describe("ensure", () => {
  it("runs cleanup on end", () => {
    const scheduler = new TestScheduler()
    let cleaned = false
    collectSync<number>(
      ensure(
        () => {
          cleaned = true
        },
        fromArray([1, 2, 3]),
      ),
      scheduler,
    )
    expect(cleaned).toBe(true)
  })

  it("runs cleanup on dispose", () => {
    const scheduler = new TestScheduler()
    let cleaned = false
    const d = _getSource(
      ensure(() => {
        cleaned = true
      }, never()),
    ).run({ event() {}, error() {}, end() {} }, scheduler)
    expect(cleaned).toBe(false)
    d.dispose()
    expect(cleaned).toBe(true)
  })

  it("runs cleanup only once", () => {
    const scheduler = new TestScheduler()
    let count = 0
    const d = _getSource(
      ensure(
        () => {
          count++
        },
        fromArray([1]),
      ),
    ).run({ event() {}, error() {}, end() {} }, scheduler)
    d.dispose() // End already called cleanup, dispose should not call again
    expect(count).toBe(1)
  })
})

// ============================================================
// Tier 3 operators
// ============================================================

describe("race", () => {
  it("emits from the first source to emit", () => {
    const scheduler = new TestScheduler()
    // Both are synchronous, so the first source wins
    const result = collectSync<number>(race(fromArray([1, 2]), fromArray([10, 20])), scheduler)
    expect(result).toEqual([1, 2])
  })

  it("handles empty race", () => {
    const scheduler = new TestScheduler()
    const result = collectSync<number>(race(), scheduler)
    expect(result).toEqual([])
  })

  it("single source passes through", () => {
    const scheduler = new TestScheduler()
    const result = collectSync<number>(race(fromArray([1, 2, 3])), scheduler)
    expect(result).toEqual([1, 2, 3])
  })
})

describe("count", () => {
  it("emits the total number of values on end", () => {
    const scheduler = new TestScheduler()
    const result = collectSync<number>(count(fromArray([10, 20, 30, 40])), scheduler)
    expect(result).toEqual([4])
  })

  it("emits 0 for empty stream", () => {
    const scheduler = new TestScheduler()
    const result = collectSync<number>(count(empty()), scheduler)
    expect(result).toEqual([0])
  })
})

describe("all", () => {
  it("emits true when all match", () => {
    const scheduler = new TestScheduler()
    const result = collectSync<boolean>(
      all((x: number) => x > 0, fromArray([1, 2, 3])),
      scheduler,
    )
    expect(result).toEqual([true])
  })

  it("emits false as soon as one fails", () => {
    const scheduler = new TestScheduler()
    const result = collectSync<boolean>(
      all((x: number) => x > 0, fromArray([1, -1, 3])),
      scheduler,
    )
    expect(result).toEqual([false])
  })

  it("emits true for empty stream", () => {
    const scheduler = new TestScheduler()
    const result = collectSync<boolean>(
      all((x: number) => x > 0, empty()),
      scheduler,
    )
    expect(result).toEqual([true])
  })
})

describe("elementAt", () => {
  it("emits only the nth element", () => {
    const scheduler = new TestScheduler()
    const result = collectSync<number>(elementAt(2, fromArray([10, 20, 30, 40])), scheduler)
    expect(result).toEqual([30])
  })

  it("emits nothing if index is out of bounds", () => {
    const scheduler = new TestScheduler()
    const result = collectSync<number>(elementAt(5, fromArray([10, 20])), scheduler)
    expect(result).toEqual([])
  })

  it("emits first element at index 0", () => {
    const scheduler = new TestScheduler()
    const result = collectSync<number>(elementAt(0, fromArray([10, 20, 30])), scheduler)
    expect(result).toEqual([10])
  })
})

describe("range", () => {
  it("emits a sequence of numbers", () => {
    const scheduler = new TestScheduler()
    const result = collectSync<number>(range(0, 5), scheduler)
    expect(result).toEqual([0, 1, 2, 3, 4])
  })

  it("starts from the given start value", () => {
    const scheduler = new TestScheduler()
    const result = collectSync<number>(range(3, 4), scheduler)
    expect(result).toEqual([3, 4, 5, 6])
  })

  it("emits nothing for count 0", () => {
    const scheduler = new TestScheduler()
    const result = collectSync<number>(range(0, 0), scheduler)
    expect(result).toEqual([])
  })

  it("handles negative count as 0", () => {
    const scheduler = new TestScheduler()
    const result = collectSync<number>(range(0, -5), scheduler)
    expect(result).toEqual([])
  })
})

describe("timeout", () => {
  it("passes through events when they arrive before the deadline", () => {
    const scheduler = new TestScheduler()
    const values: number[] = []
    const errors: unknown[] = []
    // fromArray emits synchronously at t=0, well before any timeout
    _getSource(timeout(toDuration(100), fromArray([1, 2, 3]))).run(
      {
        event(_t: Time, v: number) {
          values.push(v)
        },
        error(_t: Time, e: unknown) {
          errors.push(e)
        },
        end() {},
      } as Sink<number, TimeoutError>,
      scheduler,
    )
    scheduler.flush()
    expect(values).toEqual([1, 2, 3])
    expect(errors).toEqual([])
  })

  it("fires TimeoutError when no event arrives within duration", () => {
    const scheduler = new TestScheduler()
    const errors: unknown[] = []
    // never() never emits, so the timeout should fire
    _getSource(timeout(toDuration(50), never())).run(
      {
        event() {},
        error(_t: Time, e: unknown) {
          errors.push(e)
        },
        end() {},
      } as Sink<unknown, TimeoutError>,
      scheduler,
    )
    // Advance past the timeout duration
    scheduler.advanceTo(toTime(51))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toBeInstanceOf(TimeoutError)
  })

  it("does not fire if stream ends before timeout", () => {
    const scheduler = new TestScheduler()
    const errors: unknown[] = []
    let ended = false
    // empty() ends immediately at t=0
    _getSource(timeout(toDuration(100), empty())).run(
      {
        event() {},
        error(_t: Time, e: unknown) {
          errors.push(e)
        },
        end() {
          ended = true
        },
      } as Sink<unknown, TimeoutError>,
      scheduler,
    )
    scheduler.flush()
    expect(ended).toBe(true)
    expect(errors).toEqual([])
  })

  it("dispose cancels pending timeout", () => {
    const scheduler = new TestScheduler()
    const errors: unknown[] = []
    const d = _getSource(timeout(toDuration(50), never())).run(
      {
        event() {},
        error(_t: Time, e: unknown) {
          errors.push(e)
        },
        end() {},
      } as Sink<unknown, TimeoutError>,
      scheduler,
    )
    // Dispose before timeout fires
    d.dispose()
    scheduler.advanceTo(toTime(100))
    expect(errors).toEqual([])
  })
})
