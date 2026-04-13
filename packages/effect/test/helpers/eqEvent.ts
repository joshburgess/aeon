/**
 * Timed-entry equality for `Event<A, E>`.
 *
 * Runs two events on fresh `VirtualScheduler`s, advances each to the same
 * horizon, and compares their `CollectedEntry` traces exactly — times,
 * values, errors, and end markers all included.
 *
 * This is strict equality: events that emit the same values but at different
 * times are NOT equal. Event laws all preserve timing, so this is the correct
 * notion for the law harness.
 *
 * Determinism note: FIFO insertion order is required for same-time entries
 * to compare equal across restructurings (e.g., `map id` vs identity).
 * Enforced by the FIFO tiebreak in `aeon-scheduler/heap.ts`.
 */

import { VirtualScheduler } from "aeon-scheduler"
import { type CollectedEntry, collectEvents } from "aeon-test"
import { type Time, toTime } from "aeon-types"
import type { Event } from "aeon-types"

export interface EqEventOptions<A = unknown, E = unknown> {
  /** Absolute time to advance both schedulers to. Default: 10_000. */
  readonly horizon?: Time
  /**
   * Custom equality for event values. Defaults to `Object.is`, which
   * distinguishes fresh tuple/array instances — pass a structural equality
   * when law-test outputs use nested tuples (e.g. `SemiApplicative.product`).
   */
  readonly eqA?: (x: A, y: A) => boolean
  /** Custom equality for error payloads. Default: `Object.is`. */
  readonly eqE?: (x: E, y: E) => boolean
}

const DEFAULT_HORIZON = toTime(10_000)

const entryEquals = <A, E>(
  a: CollectedEntry<A, E>,
  b: CollectedEntry<A, E>,
  eqA: (x: A, y: A) => boolean,
  eqE: (x: E, y: E) => boolean,
): boolean => {
  if (a.type !== b.type) return false
  if ((a.time as number) !== (b.time as number)) return false
  if (a.type === "event" && b.type === "event") return eqA(a.value, b.value)
  if (a.type === "error" && b.type === "error") return eqE(a.error, b.error)
  return a.type === "end" && b.type === "end"
}

const defaultEq = <T>(a: T, b: T): boolean => Object.is(a, b)

/**
 * Run both events to the same horizon and collect their timed traces.
 *
 * Exposed separately from `eqEvent` so callers (e.g., law-failure reporters)
 * can inspect the entries that disagreed rather than just seeing a boolean.
 */
export const runToEntries = <A, E = never>(
  event: Event<A, E>,
  options: EqEventOptions<A, E> = {},
): CollectedEntry<A, E>[] => {
  const horizon = options.horizon ?? DEFAULT_HORIZON
  const scheduler = new VirtualScheduler()
  const result = collectEvents(event, scheduler)
  scheduler.advanceTo(horizon)
  result.disposable.dispose()
  return result.entries.slice()
}

/**
 * Structural equality on `Event<A, E>` up to a time horizon.
 *
 * Two events are equal if, when run on fresh schedulers and advanced to the
 * same horizon, they produce identical `CollectedEntry` sequences.
 */
export const eqEvent = <A, E = never>(
  a: Event<A, E>,
  b: Event<A, E>,
  options: EqEventOptions<A, E> = {},
): boolean => {
  const eqA = (options.eqA ?? defaultEq) as (x: A, y: A) => boolean
  const eqE = (options.eqE ?? defaultEq) as (x: E, y: E) => boolean
  const left = runToEntries(a, options)
  const right = runToEntries(b, options)
  if (left.length !== right.length) return false
  for (let i = 0; i < left.length; i++) {
    if (!entryEquals(left[i]!, right[i]!, eqA, eqE)) return false
  }
  return true
}

/**
 * Structural-equality helper for nested arrays/tuples/primitives — used by
 * law tests whose instance outputs are tuples (e.g. `product`'s `[A, B]`).
 */
export const deepEqual = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false
    }
    return true
  }
  return false
}

/**
 * Weaker event equality that compares the **ordered sequence** of entries
 * by type and value, ignoring exact emission times.
 *
 * Timed sequential stream monads (e.g. aeon-core's `chain`, on which
 * `Sequential` is built) satisfy the monad associativity law up to this
 * sequence equality, but NOT pointwise in time: `flatMap(flatMap(m, f), g)`
 * and `flatMap(m, a => flatMap(f(a), g))` can produce the same value
 * sequence with different emission timings, because the former interleaves
 * the "next outer" with the "current inner's downstream" while the latter
 * strictly serialises each outer's full pipeline.
 *
 * This is the standard weakening used for timed-stream law testing. Canonical
 * `Event` (mergeMap-based) passes the strict-time variant because its
 * concurrent inners collapse timing across both restructurings.
 */
export const eqEventSeq = <A, E = never>(
  a: Event<A, E>,
  b: Event<A, E>,
  options: EqEventOptions<A, E> = {},
): boolean => {
  const eqA = (options.eqA ?? defaultEq) as (x: A, y: A) => boolean
  const eqE = (options.eqE ?? defaultEq) as (x: E, y: E) => boolean
  const left = runToEntries(a, options)
  const right = runToEntries(b, options)
  if (left.length !== right.length) return false
  for (let i = 0; i < left.length; i++) {
    const le = left[i]!
    const re = right[i]!
    if (le.type !== re.type) return false
    if (le.type === "event" && re.type === "event") {
      if (!eqA(le.value, re.value)) return false
    } else if (le.type === "error" && re.type === "error") {
      if (!eqE(le.error, re.error)) return false
    }
  }
  return true
}
