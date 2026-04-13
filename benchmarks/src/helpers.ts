/**
 * Shared helpers for benchmark suites.
 */

import { newStream } from "@most/core"
import type { Stream } from "@most/types"

/** Create a @most/core Stream from an array (not built-in). */
export const mostFromArray = <A>(arr: readonly A[]): Stream<A> =>
  newStream((sink, scheduler) => {
    const t = scheduler.currentTime()
    for (let i = 0; i < arr.length; i++) {
      sink.event(t, arr[i]!)
    }
    sink.end(t)
    return { dispose() {} }
  })

/** Pre-generate an array of N integers [0, 1, ..., N-1]. */
export const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i)

/** Add function for scan/reduce. */
export const add = (a: number, b: number): number => a + b

/** Double function for map. */
export const double = (x: number): number => x * 2

/** Even predicate for filter. */
export const isEven = (x: number): boolean => x % 2 === 0
