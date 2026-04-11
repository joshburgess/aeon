/**
 * Multicast / share.
 *
 * Shares a single subscription among multiple consumers.
 * The source is subscribed to lazily on the first consumer,
 * and disposed when the last consumer unsubscribes.
 */

import type { Disposable, Event, Scheduler, Sink, Time } from "@pulse/types";
import { _createEvent, _getSource } from "./internal/event.js";

/**
 * Share a single subscription to the source Event among all downstream consumers.
 *
 * - First subscriber triggers the source subscription
 * - Subsequent subscribers share the same subscription
 * - When the last subscriber disposes, the source subscription is disposed
 * - If a new subscriber arrives after disposal, the source is re-subscribed
 */
export const multicast = <A, E>(event: Event<A, E>): Event<A, E> => {
  const source = _getSource(event);
  const sinks = new Set<Sink<A, E>>();
  let sourceDisposable: Disposable | undefined;
  let scheduler: Scheduler | undefined;
  let ended = false;

  return _createEvent({
    run(sink: Sink<A, E>, sched: Scheduler): Disposable {
      sinks.add(sink);

      if (sinks.size === 1) {
        // First subscriber — connect to source
        scheduler = sched;
        ended = false;
        sourceDisposable = source.run(
          {
            event(time: Time, value: A) {
              for (const s of sinks) {
                s.event(time, value);
              }
            },
            error(time: Time, err: E) {
              for (const s of sinks) {
                s.error(time, err);
              }
            },
            end(time: Time) {
              ended = true;
              for (const s of sinks) {
                s.end(time);
              }
            },
          },
          sched,
        );
      } else if (ended) {
        // Source already ended — immediately end new subscriber
        sink.end(sched.currentTime());
      }

      return {
        dispose() {
          sinks.delete(sink);
          if (sinks.size === 0 && sourceDisposable !== undefined) {
            sourceDisposable.dispose();
            sourceDisposable = undefined;
            scheduler = undefined;
          }
        },
      };
    },
  });
};
