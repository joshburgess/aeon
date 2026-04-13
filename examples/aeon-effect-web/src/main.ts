/**
 * Live GitHub user search.
 *
 * A realistic pipeline: aeon owns the DOM event stream (debounce, dedupe,
 * switchLatest), Effect owns the HTTP fetch (Schema-decoded responses,
 * tagged errors, fiber-driven AbortSignal), and `fromStream` bridges them.
 *
 * Pipeline:
 *
 *   input 'input' events
 *     -> coreMap(read .value) -> trim
 *     -> debounce 300ms
 *     -> dedupe
 *     -> coreMap(q -> cons(Loading, fromStream(fetchProgram(q))))
 *     -> switchLatest       (disposes prior fetch -> interrupts fiber -> aborts request)
 *     -> observe(render)
 */

import {
  type Event,
  cons,
  map as coreMap,
  createAdapter,
  debounce,
  dedupe,
  now,
  observe,
  switchLatest,
} from "aeon-core"
import { fromStream } from "aeon-effect/bridge"
import { DefaultScheduler } from "aeon-scheduler"
import { toDuration } from "aeon-types"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"

// --- Schema + typed errors --------------------------------------------------

const GitHubUser = Schema.Struct({
  id: Schema.Number,
  login: Schema.String,
  avatar_url: Schema.String,
  html_url: Schema.String,
})
type GitHubUser = Schema.Schema.Type<typeof GitHubUser>

const SearchResponse = Schema.Struct({
  items: Schema.Array(GitHubUser),
})

class HttpError extends Data.TaggedError("HttpError")<{
  readonly status: number
}> {}

class NetworkError extends Data.TaggedError("NetworkError")<{
  readonly message: string
}> {}

class ParseError extends Data.TaggedError("ParseError")<{
  readonly message: string
}> {}

type FetchError = HttpError | NetworkError | ParseError

// --- HTTP program -----------------------------------------------------------
// Canonical Effect HTTP: `Effect.tryPromise`'s `try` callback receives an
// AbortSignal that is already wired to the running fiber, so when the fiber
// is interrupted (by switchLatest disposing the previous inner Event) the
// fetch aborts at the transport layer. Schema decodes the response and
// pipes ParseError through the typed error channel.
const fetchUsers = (query: string): Effect.Effect<readonly GitHubUser[], FetchError> =>
  Effect.gen(function* () {
    const url = `https://api.github.com/search/users?q=${encodeURIComponent(query)}&per_page=10`

    const response = yield* Effect.tryPromise({
      try: (signal) => fetch(url, { signal }),
      catch: (cause) =>
        new NetworkError({
          message: cause instanceof Error ? cause.message : String(cause),
        }),
    })

    if (!response.ok) {
      return yield* new HttpError({ status: response.status })
    }

    const json = yield* Effect.tryPromise({
      try: () => response.json() as Promise<unknown>,
      catch: (cause) =>
        new NetworkError({
          message: cause instanceof Error ? cause.message : String(cause),
        }),
    })

    const decoded = yield* Schema.decodeUnknown(SearchResponse)(json).pipe(
      Effect.mapError((error) => new ParseError({ message: error.message })),
    )

    return decoded.items
  })

// --- View state -------------------------------------------------------------

type SearchState = Data.TaggedEnum<{
  Idle: object
  Loading: { readonly query: string }
  Success: { readonly query: string; readonly users: readonly GitHubUser[] }
  Error: { readonly query: string; readonly error: FetchError }
}>
const SearchState = Data.taggedEnum<SearchState>()

// --- DOM plumbing -----------------------------------------------------------

const $input = document.getElementById("q") as HTMLInputElement
const $status = document.getElementById("status") as HTMLDivElement
const $results = document.getElementById("results") as HTMLUListElement
const $log = document.getElementById("log") as HTMLDivElement

const logLine = (msg: string) => {
  const ts = new Date().toLocaleTimeString()
  $log.textContent = `[${ts}] ${msg}\n${$log.textContent ?? ""}`.slice(0, 2000)
}

const [pushQuery, inputEvent] = createAdapter<string, never>()
$input.addEventListener("input", () => pushQuery($input.value))

// --- aeon pipeline ----------------------------------------------------------

const scheduler = new DefaultScheduler()

const queries: Event<string, never> = dedupe(
  coreMap((s: string) => s.trim(), debounce(toDuration(300), inputEvent)),
)

const stateForQuery = (q: string): Event<SearchState, never> => {
  if (q.length === 0) return now<SearchState>(SearchState.Idle())

  // Canonical Effect pipeline: map success into the Success state, catchAll
  // typed errors into the Error state (so the Stream never fails), tap a
  // dispatch log, and run onInterrupt to log fiber interruption. onInterrupt
  // fires on switchLatest's dispose -> fiber interrupt, which also aborts
  // the fetch via the tryPromise AbortSignal wiring.
  const program = fetchUsers(q).pipe(
    Effect.map((users): SearchState => SearchState.Success({ query: q, users })),
    Effect.catchAll(
      (error): Effect.Effect<SearchState> => Effect.succeed(SearchState.Error({ query: q, error })),
    ),
    Effect.tap(() => Effect.sync(() => logLine(`success   "${q}"`))),
    Effect.onInterrupt(() => Effect.sync(() => logLine(`cancel    "${q}"`))),
  )

  logLine(`dispatch  "${q}"`)
  const result = fromStream<SearchState, never>(Stream.fromEffect(program))
  return cons<SearchState, never>(SearchState.Loading({ query: q }), result)
}

const states = switchLatest(coreMap(stateForQuery, queries))

// --- Render -----------------------------------------------------------------

const render = SearchState.$match({
  Idle: () => {
    $status.textContent = ""
    $results.innerHTML = ""
  },
  Loading: ({ query }) => {
    $status.textContent = `searching "${query}"...`
  },
  Success: ({ query, users }) => {
    $status.textContent = `${users.length} results for "${query}"`
    $results.innerHTML = ""
    for (const u of users) {
      const li = document.createElement("li")
      const img = document.createElement("img")
      img.src = u.avatar_url
      img.alt = ""
      const a = document.createElement("a")
      a.href = u.html_url
      a.target = "_blank"
      a.rel = "noopener noreferrer"
      a.textContent = u.login
      li.append(img, a)
      $results.appendChild(li)
    }
  },
  Error: ({ query, error }) => {
    const detail =
      error._tag === "HttpError"
        ? `HTTP ${error.status}`
        : error._tag === "ParseError"
          ? `parse: ${error.message}`
          : `network: ${error.message}`
    $status.textContent = `error for "${query}": ${detail}`
    $results.innerHTML = ""
  },
})

observe(render, states, scheduler).catch((err) => {
  logLine(`fatal ${String(err)}`)
})
