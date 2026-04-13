/**
 * Live GitHub user search.
 *
 * A realistic pipeline: aeon owns the DOM event stream (debounce, dedupe,
 * switchLatest), Effect owns the HTTP fetch (typed errors, interruption via
 * AbortController), and `fromStream` bridges them.
 *
 * Pipeline:
 *
 *   input 'input' events
 *     -> coreMap(read .value) -> trim
 *     -> debounce 300ms
 *     -> dedupe
 *     -> coreMap(q -> cons(Loading, fromStream(fetchEffect(q))))
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
} from "aeon-core";
import { fromStream } from "aeon-effect/bridge";
import { DefaultScheduler } from "aeon-scheduler";
import { toDuration } from "aeon-types";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";

// --- Types ------------------------------------------------------------------

interface GitHubUser {
  readonly id: number;
  readonly login: string;
  readonly avatar_url: string;
  readonly html_url: string;
}

type FetchError =
  | { readonly _tag: "HttpError"; readonly status: number }
  | { readonly _tag: "NetworkError"; readonly message: string };

type SearchState =
  | { readonly _tag: "Idle" }
  | { readonly _tag: "Loading"; readonly query: string }
  | {
      readonly _tag: "Success";
      readonly query: string;
      readonly users: readonly GitHubUser[];
    }
  | {
      readonly _tag: "Error";
      readonly query: string;
      readonly error: FetchError;
    };

// --- Effect side: HTTP with interruption ------------------------------------
// Effect.async lets us return a cleanup effect that fires on fiber interrupt.
// switchLatest disposes the previous inner Event on a new query, which
// interrupts the fiber, which aborts the fetch.
const fetchUsers = (query: string): Effect.Effect<readonly GitHubUser[], FetchError> =>
  Effect.async<readonly GitHubUser[], FetchError>((resume) => {
    const ac = new AbortController();
    const url = `https://api.github.com/search/users?q=${encodeURIComponent(query)}&per_page=10`;
    fetch(url, { signal: ac.signal })
      .then(async (res) => {
        if (!res.ok) {
          resume(Effect.fail({ _tag: "HttpError", status: res.status }));
          return;
        }
        const json = (await res.json()) as { items: GitHubUser[] };
        resume(Effect.succeed(json.items));
      })
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name === "AbortError") return;
        resume(
          Effect.fail({
            _tag: "NetworkError",
            message: err instanceof Error ? err.message : String(err),
          }),
        );
      });
    return Effect.sync(() => ac.abort());
  });

// --- DOM plumbing -----------------------------------------------------------

const $input = document.getElementById("q") as HTMLInputElement;
const $status = document.getElementById("status") as HTMLDivElement;
const $results = document.getElementById("results") as HTMLUListElement;
const $log = document.getElementById("log") as HTMLDivElement;

const logLine = (msg: string) => {
  const ts = new Date().toLocaleTimeString();
  $log.textContent = `[${ts}] ${msg}\n${$log.textContent ?? ""}`.slice(0, 2000);
};

const [pushQuery, inputEvent] = createAdapter<string, never>();
$input.addEventListener("input", () => pushQuery($input.value));

// --- aeon pipeline ----------------------------------------------------------

const scheduler = new DefaultScheduler();

const queries: Event<string, never> = dedupe(
  coreMap((s: string) => s.trim(), debounce(toDuration(300), inputEvent)),
);

const stateForQuery = (q: string): Event<SearchState, never> => {
  if (q.length === 0) return now<SearchState>({ _tag: "Idle" });
  logLine(`dispatch  "${q}"`);
  const effect = fetchUsers(q).pipe(
    Effect.map((users): SearchState => ({ _tag: "Success", query: q, users })),
    Effect.catchAll(
      (error): Effect.Effect<SearchState> => Effect.succeed({ _tag: "Error", query: q, error }),
    ),
    Effect.onInterrupt(() => Effect.sync(() => logLine(`cancel    "${q}"`))),
  );
  const result = fromStream<SearchState, never>(Stream.fromEffect(effect));
  return cons<SearchState, never>({ _tag: "Loading", query: q }, result);
};

const states = switchLatest(coreMap(stateForQuery, queries));

// --- Render -----------------------------------------------------------------

const render = (s: SearchState) => {
  switch (s._tag) {
    case "Idle":
      $status.textContent = "";
      $results.innerHTML = "";
      return;
    case "Loading":
      $status.textContent = `searching "${s.query}"...`;
      return;
    case "Success": {
      $status.textContent = `${s.users.length} results for "${s.query}"`;
      logLine(`success   "${s.query}" (${s.users.length})`);
      $results.innerHTML = "";
      for (const u of s.users) {
        const li = document.createElement("li");
        const img = document.createElement("img");
        img.src = u.avatar_url;
        img.alt = "";
        const a = document.createElement("a");
        a.href = u.html_url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = u.login;
        li.append(img, a);
        $results.appendChild(li);
      }
      return;
    }
    case "Error": {
      const detail =
        s.error._tag === "HttpError" ? `HTTP ${s.error.status}` : `network: ${s.error.message}`;
      $status.textContent = `error for "${s.query}": ${detail}`;
      logLine(`error     "${s.query}" ${detail}`);
      $results.innerHTML = "";
      return;
    }
  }
};

observe(render, states, scheduler).catch((err) => {
  logLine(`fatal ${String(err)}`);
});
