/**
 * mapAsync combinator.
 *
 * Applies an async function to each event value with bounded concurrency.
 * When all concurrency slots are occupied, incoming values are buffered.
 *
 * Uses monomorphic classes for V8 hidden class stability.
 */

import type { Disposable, Event, Scheduler, Sink, Source, Time } from "@pulse/types";
import { _createEvent, _getSource } from "../internal/event.js";

class MapAsyncState<A, B, E> {
  declare readonly sink: Sink<B, E>;
  declare readonly f: (a: A) => Promise<B>;
  declare readonly concurrency: number;
  declare readonly buffer: { time: Time; value: A }[];
  declare active: number;
  declare outerEnded: boolean;
  declare disposed: boolean;
  declare lastTime: Time;

  constructor(f: (a: A) => Promise<B>, concurrency: number, sink: Sink<B, E>, time: Time) {
    this.f = f;
    this.concurrency = concurrency;
    this.sink = sink;
    this.buffer = [];
    this.active = 0;
    this.outerEnded = false;
    this.disposed = false;
    this.lastTime = time;
  }

  tryDrain(): void {
    while (this.active < this.concurrency && this.buffer.length > 0) {
      const { time, value } = this.buffer.shift()!;
      this.startOne(time, value);
    }
  }

  startOne(time: Time, value: A): void {
    this.active++;
    const f = this.f;
    f(value).then(
      (result) => {
        if (this.disposed) return;
        this.sink.event(time, result);
        this.active--;
        if (this.buffer.length > 0) {
          this.tryDrain();
        } else if (this.outerEnded && this.active === 0) {
          this.sink.end(this.lastTime);
        }
      },
      (err) => {
        if (this.disposed) return;
        this.sink.error(time, err as E);
      },
    );
  }
}

class MapAsyncSink<A, B, E> implements Sink<A, E> {
  declare readonly state: MapAsyncState<A, B, E>;

  constructor(state: MapAsyncState<A, B, E>) {
    this.state = state;
  }

  event(time: Time, value: A): void {
    this.state.lastTime = time;
    if (this.state.active < this.state.concurrency) {
      this.state.startOne(time, value);
    } else {
      this.state.buffer.push({ time, value });
    }
  }

  error(time: Time, err: E): void {
    this.state.sink.error(time, err);
  }

  end(time: Time): void {
    this.state.lastTime = time;
    this.state.outerEnded = true;
    if (this.state.active === 0 && this.state.buffer.length === 0) {
      this.state.sink.end(time);
    }
  }
}

class MapAsyncSource<A, B, E> implements Source<B, E> {
  declare readonly f: (a: A) => Promise<B>;
  declare readonly concurrency: number;
  declare readonly source: Source<A, E>;

  constructor(f: (a: A) => Promise<B>, concurrency: number, source: Source<A, E>) {
    this.f = f;
    this.concurrency = concurrency;
    this.source = source;
  }

  run(sink: Sink<B, E>, scheduler: Scheduler): Disposable {
    const state = new MapAsyncState<A, B, E>(this.f, this.concurrency, sink, scheduler.currentTime());
    const outerDisposable = this.source.run(new MapAsyncSink(state), scheduler);

    return {
      dispose() {
        state.disposed = true;
        outerDisposable.dispose();
      },
    };
  }
}

/**
 * Apply an async function to each event value with bounded concurrency.
 *
 * Denotation: `mapAsync(f, c, e) = [(t, await f(v)) | (t, v) ∈ e]`
 * with at most `c` pending promises at any time. When all slots are
 * occupied, incoming values are buffered until a slot frees up.
 *
 * Results are emitted as promises resolve, so output order may differ
 * from input order when concurrency > 1.
 */
export const mapAsync = <A, B, E>(
  f: (a: A) => Promise<B>,
  concurrency: number,
  event: Event<A, E>,
): Event<B, E> =>
  _createEvent(new MapAsyncSource(f, concurrency, _getSource(event)));
