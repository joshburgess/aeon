/**
 * V8 monomorphism audit script.
 *
 * Run with: node --trace-deopt benchmarks/src/trace-ic.mjs
 *
 * Zero deoptimization events in Pulse code = all hot paths are monomorphic.
 */

import { chain, drain, filter, fromArray, map, merge, scan, take } from "aeon-core"
import { VirtualScheduler } from "aeon-scheduler"

const N = 100_000
const arr = Array.from({ length: N }, (_, i) => i)
const scheduler = new VirtualScheduler()

console.log("Pipeline 1: filter -> map -> scan -> drain (10 x 100k)")
for (let i = 0; i < 10; i++) {
  await drain(
    scan(
      (a, x) => a + x,
      0,
      map(
        (x) => x * 2,
        filter((x) => x % 2 === 0, fromArray(arr)),
      ),
    ),
    scheduler,
  )
}

console.log("Pipeline 2: chain/flatMap (10 x 100x100)")
const small = Array.from({ length: 100 }, (_, i) => i)
for (let i = 0; i < 10; i++) {
  await drain(
    chain(() => fromArray(small), fromArray(small)),
    scheduler,
  )
}

console.log("Pipeline 3: merge (10 x 3x100k)")
for (let i = 0; i < 10; i++) {
  await drain(merge(fromArray(arr), fromArray(arr), fromArray(arr)), scheduler)
}

console.log("Pipeline 4: take (10 x take 100 from 100k)")
for (let i = 0; i < 10; i++) {
  await drain(take(100, fromArray(arr)), scheduler)
}

console.log("Done. If no [deoptimize] lines appeared above, all hot paths are monomorphic.")
