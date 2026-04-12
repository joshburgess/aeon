/**
 * Time-based combinators: debounce, throttle, delay, bufferTime, bufferCount.
 *
 * These use the Scheduler for timing and are the async boundary
 * where push meets scheduled execution.
 *
 * Uses monomorphic Sink/Source classes for V8 hidden class stability.
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
import { Pipe } from "../internal/Pipe.js";
import { _createEvent, _getSource } from "../internal/event.js";

// --- debounce ---

class DebounceSink<A, E> implements Sink<A, E> {
  declare readonly sink: Sink<A, E>;
  declare readonly duration: Duration;
  declare readonly scheduler: Scheduler;
  declare pending: ScheduledTask | undefined;
  declare latestValue: A | undefined;
  declare hasValue: boolean;

  constructor(duration: Duration, sink: Sink<A, E>, scheduler: Scheduler) {
    this.duration = duration;
    this.sink = sink;
    this.scheduler = scheduler;
    this.pending = undefined;
    this.latestValue = undefined;
    this.hasValue = false;
  }

  event(_time: Time, value: A): void {
    this.latestValue = value;
    this.hasValue = true;

    if (this.pending !== undefined) {
      this.pending.dispose();
    }

    this.pending = this.scheduler.scheduleTask(this.duration, {
      run: (t: Time) => {
        if (this.hasValue) {
          this.hasValue = false;
          this.sink.event(t, this.latestValue as A);
        }
      },
      error: (t: Time, err: unknown) => {
        this.sink.error(t, err as E);
      },
      dispose: () => {},
    });
  }

  error(time: Time, err: E): void {
    this.clearPending();
    this.sink.error(time, err);
  }

  end(time: Time): void {
    this.clearPending();
    if (this.hasValue) {
      this.sink.event(time, this.latestValue as A);
    }
    this.sink.end(time);
  }

  clearPending(): void {
    if (this.pending !== undefined) {
      this.pending.dispose();
      this.pending = undefined;
    }
  }
}

class DebounceSource<A, E> implements Source<A, E> {
  declare readonly duration: Duration;
  declare readonly source: Source<A, E>;

  constructor(duration: Duration, source: Source<A, E>) {
    this.duration = duration;
    this.source = source;
  }

  run(sink: Sink<A, E>, scheduler: Scheduler): Disposable {
    const debounceSink = new DebounceSink(this.duration, sink, scheduler);
    const d = this.source.run(debounceSink, scheduler);
    return {
      dispose() {
        debounceSink.clearPending();
        d.dispose();
      },
    };
  }
}

/**
 * Wait for a quiet period before emitting the latest value.
 * Each new value resets the timer.
 *
 * Denotation: emits the last value in each burst, after `duration` of silence.
 */
export const debounce = <A, E>(duration: Duration, event: Event<A, E>): Event<A, E> =>
  _createEvent(new DebounceSource(duration, _getSource(event)));

// --- throttle ---

class ThrottleSink<A, E> extends Pipe<A, E> {
  declare readonly duration: Duration;
  declare readonly scheduler: Scheduler;
  declare lastEmitTime: number;

  constructor(duration: Duration, sink: Sink<A, E>, scheduler: Scheduler) {
    super(sink);
    this.duration = duration;
    this.scheduler = scheduler;
    this.lastEmitTime = Number.NEGATIVE_INFINITY;
  }

  event(time: Time, value: A): void {
    const now = time as number;
    if (now - this.lastEmitTime >= (this.duration as number)) {
      this.lastEmitTime = now;
      this.sink.event(time, value);
    }
  }
}

class ThrottleSource<A, E> implements Source<A, E> {
  declare readonly duration: Duration;
  declare readonly source: Source<A, E>;

  constructor(duration: Duration, source: Source<A, E>) {
    this.duration = duration;
    this.source = source;
  }

  run(sink: Sink<A, E>, scheduler: Scheduler): Disposable {
    return this.source.run(new ThrottleSink(this.duration, sink, scheduler), scheduler);
  }
}

/**
 * Emit at most one value per duration window.
 * Takes the first value in each window, ignores the rest.
 *
 * Denotation: rate-limits the event sequence.
 */
export const throttle = <A, E>(duration: Duration, event: Event<A, E>): Event<A, E> =>
  _createEvent(new ThrottleSource(duration, _getSource(event)));

// --- delay ---

class DelaySink<A, E> implements Sink<A, E> {
  declare readonly sink: Sink<A, E>;
  declare readonly duration: Duration;
  declare readonly scheduler: Scheduler;
  declare readonly pendingTasks: ScheduledTask[];

  constructor(duration: Duration, sink: Sink<A, E>, scheduler: Scheduler) {
    this.duration = duration;
    this.sink = sink;
    this.scheduler = scheduler;
    this.pendingTasks = [];
  }

  event(_time: Time, value: A): void {
    const st = this.scheduler.scheduleTask(this.duration, {
      run: (t: Time) => {
        this.sink.event(t, value);
      },
      error: (t: Time, err: unknown) => {
        this.sink.error(t, err as E);
      },
      dispose: () => {},
    });
    this.pendingTasks.push(st);
  }

  error(time: Time, err: E): void {
    this.sink.error(time, err);
  }

  end(_time: Time): void {
    const st = this.scheduler.scheduleTask(this.duration, {
      run: (t: Time) => {
        this.sink.end(t);
      },
      error: () => {},
      dispose: () => {},
    });
    this.pendingTasks.push(st);
  }
}

class DelaySource<A, E> implements Source<A, E> {
  declare readonly duration: Duration;
  declare readonly source: Source<A, E>;

  constructor(duration: Duration, source: Source<A, E>) {
    this.duration = duration;
    this.source = source;
  }

  run(sink: Sink<A, E>, scheduler: Scheduler): Disposable {
    const delaySink = new DelaySink(this.duration, sink, scheduler);
    const d = this.source.run(delaySink, scheduler);
    return {
      dispose() {
        for (const st of delaySink.pendingTasks) {
          st.dispose();
        }
        d.dispose();
      },
    };
  }
}

/**
 * Delay each event by a fixed duration.
 *
 * Denotation: `delay(d, e) = [(t + d, v) | (t, v) ∈ e]`
 */
export const delay = <A, E>(duration: Duration, event: Event<A, E>): Event<A, E> =>
  _createEvent(new DelaySource(duration, _getSource(event)));

// --- bufferCount ---

class BufferCountSink<A, E> implements Sink<A, E> {
  declare readonly sink: Sink<A[], E>;
  declare readonly count: number;
  declare buffer: A[];

  constructor(count: number, sink: Sink<A[], E>) {
    this.count = count;
    this.sink = sink;
    this.buffer = [];
  }

  event(time: Time, value: A): void {
    this.buffer.push(value);
    if (this.buffer.length >= this.count) {
      const batch = this.buffer;
      this.buffer = [];
      this.sink.event(time, batch);
    }
  }

  error(time: Time, err: E): void {
    this.sink.error(time, err);
  }

  end(time: Time): void {
    if (this.buffer.length > 0) {
      this.sink.event(time, this.buffer);
      this.buffer = [];
    }
    this.sink.end(time);
  }
}

class BufferCountSource<A, E> implements Source<A[], E> {
  declare readonly count: number;
  declare readonly source: Source<A, E>;

  constructor(count: number, source: Source<A, E>) {
    this.count = count;
    this.source = source;
  }

  run(sink: Sink<A[], E>, scheduler: Scheduler): Disposable {
    return this.source.run(new BufferCountSink(this.count, sink), scheduler);
  }
}

/**
 * Buffer values into arrays of a fixed size.
 * Emits when the buffer reaches `count`. Flushes remaining on end.
 */
export const bufferCount = <A, E>(count: number, event: Event<A, E>): Event<A[], E> =>
  _createEvent(new BufferCountSource(count, _getSource(event)));

// --- bufferTime ---

class BufferTimeSink<A, E> implements Sink<A, E> {
  declare readonly sink: Sink<A[], E>;
  declare buffer: A[];
  declare ended: boolean;

  constructor(sink: Sink<A[], E>) {
    this.sink = sink;
    this.buffer = [];
    this.ended = false;
  }

  event(_time: Time, value: A): void {
    this.buffer.push(value);
  }

  error(time: Time, err: E): void {
    this.sink.error(time, err);
  }

  end(time: Time): void {
    this.ended = true;
    if (this.buffer.length > 0) {
      this.sink.event(time, this.buffer);
      this.buffer = [];
    }
    this.sink.end(time);
  }
}

class BufferTimeSource<A, E> implements Source<A[], E> {
  declare readonly duration: Duration;
  declare readonly source: Source<A, E>;

  constructor(duration: Duration, source: Source<A, E>) {
    this.duration = duration;
    this.source = source;
  }

  run(sink: Sink<A[], E>, scheduler: Scheduler): Disposable {
    const btSink = new BufferTimeSink<A, E>(sink);

    const flush = (): void => {
      if (btSink.buffer.length > 0) {
        const batch = btSink.buffer;
        btSink.buffer = [];
        sink.event(scheduler.currentTime(), batch);
      }
      if (!btSink.ended) {
        scheduler.scheduleTask(this.duration, {
          run: () => flush(),
          error: () => {},
          dispose: () => {},
        });
      }
    };

    scheduler.scheduleTask(this.duration, {
      run: () => flush(),
      error: () => {},
      dispose: () => {},
    });

    return this.source.run(btSink, scheduler);
  }
}

/**
 * Buffer values over a time window.
 * Emits the buffer contents at the end of each window.
 */
export const bufferTime = <A, E>(duration: Duration, event: Event<A, E>): Event<A[], E> =>
  _createEvent(new BufferTimeSource(duration, _getSource(event)));
