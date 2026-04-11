// @pulse/core — Event and Behavior implementations, combinators

// Re-export types
export type { Event, Behavior, Sink, Source, Scheduler, Disposable } from "@pulse/types";

// Event constructors
export { empty, never, now, at, fromArray, fromIterable, periodic } from "./constructors.js";

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
  skip,
  takeWhile,
  skipWhile,
  slice,
  until,
  since,
  merge,
  combine,
  zip,
  switchLatest,
  mergeMapConcurrently,
  catchError,
  mapError,
  throwError,
  chain,
  debounce,
  throttle,
  delay,
  bufferCount,
  bufferTime,
  mapAsync,
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
  stepper,
  sample,
  snapshot,
  switcher,
  integral,
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
