/**
 * Marble testing DSL for Pulse.
 *
 * Marble notation:
 *   - `-`  : one time unit passes (no emission)
 *   - `a`  : value emission (looked up in values map)
 *   - `|`  : end (stream completes)
 *   - `#`  : error (uses provided error value)
 *   - `(`  : group start — multiple events at the same time
 *   - `)`  : group end
 *
 * Examples:
 *   "--a--b--c--|"     → emits a at t=2, b at t=5, c at t=8, ends at t=11
 *   "--(ab)--c--|"     → emits a,b both at t=2, c at t=8, ends at t=11
 *   "--a--#"           → emits a at t=2, errors at t=5
 *
 * The `timeUnit` parameter controls how many ms each `-` represents.
 * Default is 1ms per unit.
 */

import type { Time } from "aeon-types"
import { toTime } from "aeon-types"

/** A parsed marble event. */
export type MarbleEntry<A, E> =
  | { readonly type: "event"; readonly time: Time; readonly value: A }
  | { readonly type: "error"; readonly time: Time; readonly error: E }
  | { readonly type: "end"; readonly time: Time }

/**
 * Parse a marble string into a sequence of timed entries.
 *
 * @param marble - The marble notation string
 * @param values - Map from single-character keys to values
 * @param error - The error value for `#`
 * @param timeUnit - Milliseconds per time unit (default: 1)
 */
export const parseMarble = <A, E = never>(
  marble: string,
  values: Record<string, A>,
  error?: E,
  timeUnit = 1,
): MarbleEntry<A, E>[] => {
  const entries: MarbleEntry<A, E>[] = []
  let time = 0
  let inGroup = false

  for (let i = 0; i < marble.length; i++) {
    const ch = marble[i]!

    switch (ch) {
      case "-":
        if (!inGroup) time += timeUnit
        break

      case "(":
        inGroup = true
        break

      case ")":
        inGroup = false
        if (!inGroup) time += timeUnit
        break

      case "|":
        entries.push({ type: "end", time: toTime(time) })
        if (!inGroup) time += timeUnit
        break

      case "#":
        entries.push({ type: "error", time: toTime(time), error: error as E })
        if (!inGroup) time += timeUnit
        break

      case " ":
        break

      default: {
        const value = values[ch]
        if (value === undefined) {
          throw new Error(`Marble character '${ch}' not found in values map`)
        }
        entries.push({ type: "event", time: toTime(time), value })
        if (!inGroup) time += timeUnit
        break
      }
    }
  }

  return entries
}

/**
 * Compute the total duration of a marble string (in time units).
 */
export const marbleDuration = (marble: string, timeUnit = 1): number => {
  let time = 0
  let inGroup = false

  for (let i = 0; i < marble.length; i++) {
    const ch = marble[i]!
    if (ch === "(") {
      inGroup = true
      continue
    }
    if (ch === ")") {
      inGroup = false
      time += timeUnit
      continue
    }
    if (ch === " ") continue
    if (!inGroup) time += timeUnit
  }

  return time
}
