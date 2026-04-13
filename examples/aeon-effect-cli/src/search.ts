/**
 * Interactive stdin-driven live search.
 *
 * Demonstrates a realistic aeon + Effect pipeline:
 *
 *   keypress  -->  aeon adapter  -->  debounce  -->  dedupe
 *                                                       |
 *                                                       v
 *                                        map(q => Effect search program)
 *                                                       |
 *                                                       v
 *                                                 switchLatest
 *                                                       |
 *                                                       v
 *                                                   observe
 *
 * aeon handles the stream of user input (time-based combinators), Effect
 * handles the async work (structured concurrency, interruption). The
 * `fromStream` bridge lets `switchLatest` cancel in-flight Effect searches
 * when the user keeps typing — the prior fiber is interrupted, and its
 * `onInterrupt` handler fires.
 *
 * Run:   pnpm --filter aeon-effect-cli-example start
 */

import * as process from "node:process"
import * as readline from "node:readline"

import { map as coreMap, createAdapter, debounce, dedupe, observe, switchLatest } from "aeon-core"
import { fromStream } from "aeon-effect/bridge"
import { DefaultScheduler } from "aeon-scheduler"
import { toDuration } from "aeon-types"
import * as Clock from "effect/Clock"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Stream from "effect/Stream"

const DATASET = [
  "react",
  "redux",
  "rxjs",
  "solid",
  "svelte",
  "vue",
  "angular",
  "effect",
  "aeon",
  "fp-ts",
  "ramda",
  "lodash",
  "typescript",
  "javascript",
  "rescript",
  "purescript",
  "haskell",
  "ocaml",
  "elm",
  "scala",
  "kotlin",
  "rust",
  "zig",
]

interface SearchResult {
  readonly query: string
  readonly matches: readonly string[]
  readonly took: number
}

// Redraw helpers so log lines don't stomp the prompt line.
let buffer = ""
const drawPrompt = () => {
  process.stdout.write(`\r\x1b[2K> ${buffer}`)
}
const log = (msg: string) => {
  process.stdout.write("\r\x1b[2K")
  process.stdout.write(`${msg}\n`)
  drawPrompt()
}

// The "real async work": an Effect program that logs start, sleeps to
// simulate I/O, filters the dataset, and logs cancellation on interrupt.
// Because it's a real Effect, switchLatest's dispose -> fiber interrupt
// pipeline fires `onInterrupt` even mid-sleep.
// Canonical Effect program: read the clock via `Clock.currentTimeMillis`,
// lift every side effect (logging) through `Effect.sync`, sleep via a
// `Duration`, and attach an interrupt handler that fires when the fiber is
// cancelled by switchLatest disposing the previous inner Event.
const searchEffect = (query: string): Effect.Effect<SearchResult> =>
  Effect.gen(function* () {
    const start = yield* Clock.currentTimeMillis
    yield* Effect.sync(() => log(`  [effect] searching "${query}"...`))
    yield* Effect.sleep(Duration.millis(800))
    const q = query.toLowerCase()
    const matches = DATASET.filter((w) => w.includes(q))
    const end = yield* Clock.currentTimeMillis
    return { query, matches, took: end - start }
  }).pipe(Effect.onInterrupt(() => Effect.sync(() => log(`  [effect] cancelled "${query}"`))))

const scheduler = new DefaultScheduler()
const [pushQuery, input] = createAdapter<string, never>()

const searches = switchLatest(
  coreMap(
    (q: string) => fromStream<SearchResult, never>(Stream.fromEffect(searchEffect(q))),
    dedupe(debounce(toDuration(300), input)),
  ),
)

observe(
  (r: SearchResult) =>
    log(
      `  [result] "${r.query}" -> [${
        r.matches.length === 0 ? "(none)" : r.matches.join(", ")
      }] (${r.took}ms)`,
    ),
  searches,
  scheduler,
).catch((err) => {
  log(`[error] ${String(err)}`)
})

// --- stdin driver -----------------------------------------------------------
readline.emitKeypressEvents(process.stdin)
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true)
}
process.stdin.resume()

log(
  "Type a query. Input is debounced 300ms; keep typing to see in-flight searches get cancelled. Ctrl+C to exit.",
)
drawPrompt()

process.stdin.on("keypress", (_str, key) => {
  if (key.ctrl && key.name === "c") {
    process.stdout.write("\nbye\n")
    process.exit(0)
  }
  if (key.name === "backspace") {
    buffer = buffer.slice(0, -1)
  } else if (key.name === "return" || key.name === "enter") {
    buffer = ""
  } else if (key.sequence && key.sequence.length === 1 && !key.ctrl) {
    buffer += key.sequence
  }
  drawPrompt()
  if (buffer.length > 0) pushQuery(buffer)
})
