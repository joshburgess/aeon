/**
 * Imperative push adapter.
 *
 * createAdapter returns a [push, event] pair. Calling push(value) sends
 * the value to all current subscribers. This is the equivalent of
 * RxJS's Subject, but as a clean separated push/pull pair.
 */

import type { Disposable, Event, Scheduler, Sink, Time } from "@pulse/types";
import { _createEvent } from "./internal/event.js";

/**
 * Create an imperative push adapter.
 *
 * Returns [push, event] where:
 * - `push(value)` sends a value to all current subscribers
 * - `event` is a subscribable Event stream
 */
export const createAdapter = <A, E = never>(): [push: (value: A) => void, event: Event<A, E>] => {
  const sinks = new Set<{ sink: Sink<A, E>; scheduler: Scheduler }>();

  const push = (value: A): void => {
    if (sinks.size === 0) return;
    for (const { sink, scheduler } of sinks) {
      sink.event(scheduler.currentTime(), value);
    }
  };

  const event = _createEvent<A, E>({
    run(sink: Sink<A, E>, scheduler: Scheduler): Disposable {
      const entry = { sink, scheduler };
      sinks.add(entry);
      return {
        dispose() {
          sinks.delete(entry);
        },
      };
    },
  });

  return [push, event];
};
