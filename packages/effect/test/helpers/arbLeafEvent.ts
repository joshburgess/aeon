/**
 * Fast-check arbitrary for "leaf" `Event<A, E>` values.
 *
 * A leaf event is one built directly from a timed-entry trace via
 * `fromEntries` — it uses no combinators internally. This is the correct
 * input shape for law tests: we want to exercise `map f . map g ≡ map (f ∘ g)`
 * etc., *not* accidentally test `map` by constructing inputs with `map`.
 *
 * Generated traces satisfy:
 *   - Entries sorted by non-decreasing `time`
 *   - At most one terminator (error or end), always last if present
 *   - All times within the chosen `horizon` (default 1000)
 *   - Values drawn from the caller's arbitrary for `A`
 *   - Errors drawn from the caller's arbitrary for `E` (default: string)
 */

import type { CollectedEntry } from "aeon-test"
import { type Time, toTime } from "aeon-types"
import type { Event } from "aeon-types"
import * as fc from "effect/FastCheck"
import { fromEntries } from "./fromEntries.js"

export interface ArbLeafEventOptions<A, E> {
  /** Arbitrary for emitted values. */
  readonly value: fc.Arbitrary<A>
  /** Arbitrary for error payloads. Default: `fc.string()` (typed as E). */
  readonly error?: fc.Arbitrary<E>
  /** Maximum exclusive time for entries. Default: 1000. */
  readonly horizon?: number
  /** Max number of value entries. Default: 8. */
  readonly maxLength?: number
  /**
   * If `true`, every generated stream carries either an `end` or `error`
   * terminator (never the `open` case). Useful for chain/zip-based law tests
   * where non-terminating inners cause deadlock or ambiguous end semantics.
   * Default: `false`.
   */
  readonly requireTerminator?: boolean
  /**
   * Set of terminator shapes to draw from when a terminator is selected.
   * Defaults to all three (`"end" | "error" | "open"`). Pass `["end"]` to
   * test laws over well-terminated, error-free streams — necessary where
   * the underlying primitive's error handling isn't strictly equational
   * across restructurings (e.g. aeon-core's `chain` forwards outer errors
   * even while an inner is running, so error counts differ between
   * `flatMap(flatMap(m, f), g)` and `flatMap(m, flatMap(f, g))`).
   */
  readonly terminators?: readonly ("end" | "error" | "open")[]
  /**
   * Minimum number of value entries. Default: `0`. Set to `1` (combined with
   * `requireTerminator: true`) when the test harness cannot reason about
   * empty streams — e.g. sequential flatMap over an empty inner stalls
   * forever waiting for the inner to end before consuming the next outer
   * emission.
   */
  readonly minLength?: number
}

/**
 * Build an arbitrary producing `{ entries, event }` pairs, so tests can both
 * inspect the source trace and feed it through typeclass instances.
 */
export const arbLeafEventTrace = <A, E = string>(
  options: ArbLeafEventOptions<A, E>,
): fc.Arbitrary<{
  readonly entries: CollectedEntry<A, E>[]
  readonly event: Event<A, E>
}> => {
  const horizon = options.horizon ?? 1000
  const maxLength = options.maxLength ?? 8
  const minLength = options.minLength ?? 0
  const requireTerminator = options.requireTerminator ?? false
  const errArb = (options.error ?? fc.string()) as fc.Arbitrary<E>

  const allowed = (options.terminators ?? ["end", "error", "open"]).filter(
    (t) => !(requireTerminator && t === "open"),
  )
  if (allowed.length === 0) {
    throw new Error("arbLeafEvent: empty terminator set")
  }
  const terminatorArb = fc.oneof(...allowed.map((t) => fc.constant<"end" | "error" | "open">(t)))

  return fc
    .tuple(
      fc.array(fc.tuple(fc.integer({ min: 0, max: horizon - 1 }), options.value), {
        minLength,
        maxLength,
      }),
      terminatorArb,
      fc.integer({ min: 0, max: horizon - 1 }),
      errArb,
    )
    .map(([raw, terminator, termTime, errValue]) => {
      const sortedValues = raw
        .slice()
        .sort((a, b) => a[0] - b[0])
        .map<CollectedEntry<A, E>>(([t, v]) => ({
          type: "event",
          time: toTime(t),
          value: v,
        }))

      let entries: CollectedEntry<A, E>[] = sortedValues
      if (terminator !== "open") {
        const lastTime =
          sortedValues.length > 0 ? (sortedValues[sortedValues.length - 1]!.time as number) : 0
        const tAbs = Math.max(termTime, lastTime)
        const term: CollectedEntry<A, E> =
          terminator === "end"
            ? { type: "end", time: toTime(tAbs) }
            : { type: "error", time: toTime(tAbs), error: errValue }
        entries = [...sortedValues, term]
      }

      return { entries, event: fromEntries(entries) }
    })
}

/**
 * Convenience: arbitrary yielding just the `Event`, discarding the trace.
 * Use `arbLeafEventTrace` when you need the trace for debugging or assertions.
 */
export const arbLeafEvent = <A, E = string>(
  options: ArbLeafEventOptions<A, E>,
): fc.Arbitrary<Event<A, E>> => arbLeafEventTrace(options).map((x) => x.event)

/**
 * Stand-ins for `horizon` and `Time` used above.
 * Exposed here so tests can advance schedulers beyond the generator's range.
 */
export const defaultArbHorizon: Time = toTime(1000)
