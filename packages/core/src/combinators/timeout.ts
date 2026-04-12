/**
 * timeout combinator.
 *
 * Denotation: error if no event is emitted within a time window.
 * After each event, the timer resets. If the timer expires before
 * the next event (or the first event), an error is emitted.
 */

import type {
  Disposable,
  Duration,
  Event,
  ScheduledTask,
  Scheduler,
  Sink,
  Source,
  Time,
} from "aeon-types";
import { _createEvent, _getSource } from "../internal/event.js";

class TimeoutError extends Error {
  constructor(duration: Duration) {
    super(`Timeout: no event within ${duration as number}ms`);
    this.name = "TimeoutError";
  }
}

class TimeoutSink<A, E> implements Sink<A, E> {
  declare readonly sink: Sink<A, E | TimeoutError>;
  declare readonly duration: Duration;
  declare readonly scheduler: Scheduler;
  declare pending: ScheduledTask | undefined;
  declare active: boolean;

  constructor(duration: Duration, sink: Sink<A, E | TimeoutError>, scheduler: Scheduler) {
    this.duration = duration;
    this.sink = sink;
    this.scheduler = scheduler;
    this.active = true;
    this.pending = undefined;
    this.scheduleTimeout();
  }

  event(time: Time, value: A): void {
    if (!this.active) return;
    this.clearPending();
    this.sink.event(time, value);
    this.scheduleTimeout();
  }

  error(time: Time, err: E): void {
    if (!this.active) return;
    this.active = false;
    this.clearPending();
    this.sink.error(time, err);
  }

  end(time: Time): void {
    if (!this.active) return;
    this.active = false;
    this.clearPending();
    this.sink.end(time);
  }

  scheduleTimeout(): void {
    this.pending = this.scheduler.scheduleTask(this.duration, {
      run: (t: Time) => {
        if (this.active) {
          this.active = false;
          this.sink.error(t, new TimeoutError(this.duration) as unknown as E | TimeoutError);
        }
      },
      error: () => {},
      dispose: () => {},
    });
  }

  clearPending(): void {
    if (this.pending !== undefined) {
      this.pending.dispose();
      this.pending = undefined;
    }
  }
}

class TimeoutSource<A, E> implements Source<A, E | TimeoutError> {
  declare readonly duration: Duration;
  declare readonly source: Source<A, E>;

  constructor(duration: Duration, source: Source<A, E>) {
    this.duration = duration;
    this.source = source;
  }

  run(sink: Sink<A, E | TimeoutError>, scheduler: Scheduler): Disposable {
    const timeoutSink = new TimeoutSink<A, E>(this.duration, sink, scheduler);
    const d = this.source.run(timeoutSink as unknown as Sink<A, E>, scheduler);
    return {
      dispose() {
        timeoutSink.active = false;
        timeoutSink.clearPending();
        d.dispose();
      },
    };
  }
}

/**
 * Error if no event is emitted within `duration`.
 * The timer starts immediately and resets after each event.
 *
 * Emits a TimeoutError via the error channel.
 */
export const timeout = <A, E>(duration: Duration, event: Event<A, E>): Event<A, E | TimeoutError> =>
  _createEvent(new TimeoutSource(duration, _getSource(event)));

export { TimeoutError };
