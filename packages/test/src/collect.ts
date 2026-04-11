/**
 * Test collection helpers.
 *
 * Helpers for running a pulse Event and collecting its output
 * as a structured list of timed entries for assertion.
 */

import type { Disposable, Event as PulseEvent, Scheduler, Sink, Source, Time } from "@pulse/types";

/** A collected event entry (value, error, or end). */
export type CollectedEntry<A, E = never> =
  | { readonly type: "event"; readonly time: Time; readonly value: A }
  | { readonly type: "error"; readonly time: Time; readonly error: E }
  | { readonly type: "end"; readonly time: Time };

/** Result of collecting events from a stream. */
export interface CollectResult<A, E = never> {
  /** All collected entries in order. */
  readonly entries: CollectedEntry<A, E>[];
  /** Just the values (convenience accessor). */
  readonly values: A[];
  /** Whether the stream ended. */
  readonly ended: boolean;
  /** Whether the stream errored. */
  readonly errored: boolean;
  /** The error value, if any. */
  readonly error: E | undefined;
  /** Disposable to stop collection. */
  readonly disposable: Disposable;
}

/**
 * Subscribe to a pulse Event and collect all emissions.
 *
 * Returns a CollectResult whose `entries`, `values`, `ended`, etc.
 * update live as the scheduler advances. Use with VirtualScheduler:
 *
 * ```typescript
 * const scheduler = new VirtualScheduler();
 * const result = collectEvents(myEvent, scheduler);
 * scheduler.advanceTo(toTime(100));
 * expect(result.values).toEqual([1, 2, 3]);
 * expect(result.ended).toBe(true);
 * result.disposable.dispose();
 * ```
 */
export const collectEvents = <A, E = never>(
  event: PulseEvent<A, E>,
  scheduler: Scheduler,
): CollectResult<A, E> => {
  const entries: CollectedEntry<A, E>[] = [];
  const values: A[] = [];
  const result: CollectResult<A, E> = {
    entries,
    values,
    ended: false,
    errored: false,
    error: undefined,
    disposable: { dispose() {} },
  };

  const sink: Sink<A, E> = {
    event(time: Time, value: A) {
      entries.push({ type: "event", time, value });
      values.push(value);
    },
    error(time: Time, err: E) {
      entries.push({ type: "error", time, error: err });
      (result as { errored: boolean }).errored = true;
      (result as { error: E | undefined }).error = err;
    },
    end(time: Time) {
      entries.push({ type: "end", time });
      (result as { ended: boolean }).ended = true;
    },
  };

  const source = event as unknown as Source<A, E>;
  const disposable = source.run(sink, scheduler);
  (result as { disposable: Disposable }).disposable = disposable;

  return result;
};

/**
 * Collect all values from a synchronous Event.
 *
 * For events backed by synchronous sources (fromArray, now, empty),
 * all values are available immediately without advancing time.
 */
export const collectSync = <A>(event: PulseEvent<A, never>, scheduler: Scheduler): A[] => {
  const result = collectEvents(event, scheduler);
  result.disposable.dispose();
  return result.values;
};
