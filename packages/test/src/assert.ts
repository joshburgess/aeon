/**
 * Assertion helpers for marble-based stream testing.
 */

import type { Time } from "aeon-types"
import type { CollectedEntry } from "./collect.js"
import type { MarbleEntry } from "./marble.js"

/**
 * Compare collected entries against expected marble entries.
 *
 * Returns `{ pass: true }` if they match, or `{ pass: false, message }`
 * with a human-readable diff if they don't.
 *
 * This is framework-agnostic — use it with any assertion library:
 * ```typescript
 * const check = assertEvents(result.entries, expected);
 * if (!check.pass) throw new Error(check.message);
 * ```
 */
export const assertEvents = <A, E>(
  actual: readonly CollectedEntry<A, E>[],
  expected: readonly MarbleEntry<A, E>[],
): { pass: true } | { pass: false; message: string } => {
  if (actual.length !== expected.length) {
    return {
      pass: false,
      message:
        `Expected ${expected.length} entries, got ${actual.length}.\n` +
        `  actual:   ${formatEntries(actual)}\n` +
        `  expected: ${formatEntries(expected)}`,
    }
  }

  for (let i = 0; i < actual.length; i++) {
    const a = actual[i]!
    const e = expected[i]!

    if (a.type !== e.type) {
      return {
        pass: false,
        message:
          `Entry ${i}: expected type '${e.type}', got '${a.type}'.\n` +
          `  actual:   ${formatEntry(a)}\n` +
          `  expected: ${formatEntry(e)}`,
      }
    }

    if ((a.time as number) !== (e.time as number)) {
      return {
        pass: false,
        message:
          `Entry ${i}: expected time ${e.time as number}, got ${a.time as number}.\n` +
          `  actual:   ${formatEntry(a)}\n` +
          `  expected: ${formatEntry(e)}`,
      }
    }

    if (a.type === "event" && e.type === "event") {
      if (!Object.is(a.value, e.value)) {
        return {
          pass: false,
          message: `Entry ${i}: expected value ${JSON.stringify(e.value)}, got ${JSON.stringify(a.value)}.`,
        }
      }
    }

    if (a.type === "error" && e.type === "error") {
      if (!Object.is(a.error, e.error)) {
        return {
          pass: false,
          message: `Entry ${i}: expected error ${JSON.stringify(e.error)}, got ${JSON.stringify(a.error)}.`,
        }
      }
    }
  }

  return { pass: true }
}

const formatEntry = (
  e: CollectedEntry<unknown, unknown> | MarbleEntry<unknown, unknown>,
): string => {
  switch (e.type) {
    case "event":
      return `event(${e.time as number}, ${JSON.stringify(e.value)})`
    case "error":
      return `error(${e.time as number}, ${JSON.stringify(e.error)})`
    case "end":
      return `end(${e.time as number})`
  }
}

const formatEntries = (
  entries: readonly (CollectedEntry<unknown, unknown> | MarbleEntry<unknown, unknown>)[],
): string => `[${entries.map(formatEntry).join(", ")}]`
