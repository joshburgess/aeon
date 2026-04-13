/**
 * Micro-benchmarks: isolate the exact cause of the reduce/drain gap.
 *
 * Finding: ES2022 class is 3.1x slower than ES5 prototype.
 * Now testing: is it the class field declarations that cause this?
 */

import { bench, describe } from "vitest"

const N = 1_000_000
const arr = Array.from({ length: N }, (_, i) => i)
const add = (a: number, b: number): number => a + b

interface SimpleSink {
  event(t: number, v: number): void
  end(t: number): void
}

// --- Variant 1: ES2022 class WITH field declarations (what tsup emits) ---
// This mirrors the compiled output: `class { f; acc; constructor(...) { this.f = ...; } }`

// --- Variant 2: ES5 constructor+prototype ---
function ES5ReduceSink(
  this: { f: (a: number, b: number) => number; acc: number },
  f: (a: number, b: number) => number,
  seed: number,
) {
  this.f = f
  this.acc = seed
}
ES5ReduceSink.prototype.event = function (_t: number, v: number): void {
  const f = this.f
  this.acc = f(this.acc, v)
}
ES5ReduceSink.prototype.end = (_t: number): void => {}

// --- Variant 3: ES2022 class WITHOUT field declarations ---
// In JS, you can skip field declarations — properties are set in constructor only
const ClassNoFieldsReduceSink = (() => {
  // We use eval-free class creation to avoid field declarations
  class _Sink implements SimpleSink {
    // No field declarations! Properties only set in constructor.
    constructor(f: (a: number, b: number) => number, seed: number) {
      ;(this as any).f = f
      ;(this as any).acc = seed
    }
    event(_t: number, v: number): void {
      const f = (this as any).f
      ;(this as any).acc = f((this as any).acc, v)
    }
    end(_t: number): void {}
  }
  return _Sink
})()

// --- Variant 4: ES2022 class with field declarations (standard TS) ---
class ClassWithFieldsReduceSink implements SimpleSink {
  readonly f: (a: number, b: number) => number
  acc: number
  constructor(f: (a: number, b: number) => number, seed: number) {
    this.f = f
    this.acc = seed
  }
  event(_t: number, v: number): void {
    const f = this.f
    this.acc = f(this.acc, v)
  }
  end(_t: number): void {}
}

// --- Variant 5: Plain object literal (not closure) ---
function makeObjectLiteralSink(
  f: (a: number, b: number) => number,
  seed: number,
): SimpleSink & { acc: number } {
  return {
    acc: seed,
    event(_t: number, v: number): void {
      this.acc = f(this.acc, v)
    },
    end(_t: number): void {},
  }
}

function runSourceLoop(sink: SimpleSink, values: readonly number[]): void {
  for (let i = 0; i < values.length; i++) {
    sink.event(0, values[i]!)
  }
  sink.end(0)
}

describe("class field declarations vs alternatives", () => {
  bench("raw for-loop (baseline)", () => {
    let acc = 0
    for (let i = 0; i < arr.length; i++) {
      acc = add(acc, arr[i]!)
    }
    return acc
  })

  bench("ES5 constructor+prototype", () => {
    const sink = new (ES5ReduceSink as any)(add, 0)
    runSourceLoop(sink, arr)
    return sink.acc
  })

  bench("ES2022 class WITH field declarations", () => {
    const sink = new ClassWithFieldsReduceSink(add, 0)
    runSourceLoop(sink, arr)
    return sink.acc
  })

  bench("ES2022 class WITHOUT field declarations", () => {
    const sink = new ClassNoFieldsReduceSink(add, 0)
    runSourceLoop(sink, arr)
    return (sink as any).acc
  })

  bench("plain object literal", () => {
    const sink = makeObjectLiteralSink(add, 0)
    runSourceLoop(sink, arr)
    return sink.acc
  })
})

// Also test: what if we change the loop to avoid virtual dispatch?
// Use a specialized source that calls the accumulator directly
describe("avoid virtual dispatch entirely", () => {
  bench("direct accumulator call (no sink abstraction)", () => {
    let acc = 0
    const f = add
    for (let i = 0; i < arr.length; i++) {
      acc = f(acc, arr[i]!)
    }
    return acc
  })

  bench("sink.event via ES5 prototype", () => {
    const sink = new (ES5ReduceSink as any)(add, 0)
    for (let i = 0; i < arr.length; i++) {
      sink.event(0, arr[i]!)
    }
    return sink.acc
  })
})
