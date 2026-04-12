// aeon-core — Event and Behavior implementations, combinators

// Re-export types
export type { Event, Behavior, Sink, Source, Scheduler, Disposable } from "aeon-types";

// Event constructors
export { empty, never, now, at, fromArray, fromIterable, periodic, range } from "./constructors.js";

// Event combinators
export {
  map,
  filter,
  tap,
  constant,
  scan,
  reduce,
  observe,
  drain,
  take,
  drop,
  takeWhile,
  dropWhile,
  slice,
  until,
  since,
  merge,
  combine,
  zip,
  switchLatest,
  mergeMap,
  catchError,
  mapError,
  throwError,
  chain,
  debounce,
  throttle,
  delay,
  bufferCount,
  bufferTime,
  traverse,
  fromPromise,
  retry,
  share,
  attach,
  dedupe,
  cons,
  first,
  last,
  pairwise,
  timeout,
  TimeoutError,
  exhaustMap,
  forkJoin,
  orElse,
  ensure,
  race,
  count,
  all,
  elementAt,
} from "./combinators/index.js";

// Behavior constructors and combinators
export {
  constantB,
  fromFunction,
  time,
  pureB,
  mapB,
  liftA2B,
  liftA3B,
  liftA4B,
  liftA5B,
  stepper,
  accumB,
  sample,
  snapshot,
  switcher,
  switchB,
  integral,
  derivative,
  readBehavior,
} from "./behavior.js";

// Fluent API
export { fluent, FluentEvent } from "./fluent.js";

// Pipe utility
export { pipe } from "./pipe.js";

// Pipeable (data-last) overloads
export * as P from "./pipeable.js";

// Adapter (imperative push)
export { createAdapter } from "./adapter.js";

// Multicast (subscription sharing)
export { multicast } from "./multicast.js";

// AsyncIterator integration
export { toAsyncIterator, fromAsyncIterable } from "./asyncIterator.js";
