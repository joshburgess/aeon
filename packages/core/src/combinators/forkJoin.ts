/**
 * forkJoin combinator.
 *
 * Denotation: wait for all streams to complete, emit an array
 * of their final values. If any stream completes without emitting,
 * the result completes without emitting.
 */

import type { Disposable, Event, Scheduler, Sink, Source, Time } from "@pulse/types";
import { disposeAll } from "../internal/dispose.js";
import { _createEvent, _getSource } from "../internal/event.js";

const UNSET: unique symbol = Symbol("unset");

class ForkJoinSink<A, E> implements Sink<A, E> {
  declare readonly sink: Sink<A[], E>;
  declare readonly index: number;
  declare readonly state: ForkJoinState<A, E>;

  constructor(sink: Sink<A[], E>, index: number, state: ForkJoinState<A, E>) {
    this.sink = sink;
    this.index = index;
    this.state = state;
  }

  event(_time: Time, value: A): void {
    this.state.latestValues[this.index] = value;
  }

  error(time: Time, err: E): void {
    this.sink.error(time, err);
  }

  end(time: Time): void {
    this.state.remaining--;
    if (this.state.remaining === 0) {
      // Check all have emitted at least once
      const values = this.state.latestValues;
      for (let i = 0; i < values.length; i++) {
        if (values[i] === UNSET) {
          this.sink.end(time);
          return;
        }
      }
      this.sink.event(time, values as A[]);
      this.sink.end(time);
    }
  }
}

class ForkJoinState<A, E> {
  declare readonly latestValues: (A | typeof UNSET)[];
  declare remaining: number;

  constructor(count: number) {
    this.latestValues = new Array(count).fill(UNSET) as (A | typeof UNSET)[];
    this.remaining = count;
  }
}

class ForkJoinSource<A, E> implements Source<A[], E> {
  declare readonly sources: Source<A, E>[];

  constructor(sources: Source<A, E>[]) {
    this.sources = sources;
  }

  run(sink: Sink<A[], E>, scheduler: Scheduler): Disposable {
    const count = this.sources.length;
    if (count === 0) {
      sink.end(scheduler.currentTime());
      return { dispose() {} };
    }

    const state = new ForkJoinState<A, E>(count);
    const disposables: Disposable[] = [];

    for (let i = 0; i < count; i++) {
      disposables.push(this.sources[i]!.run(new ForkJoinSink(sink, i, state), scheduler));
    }

    return disposeAll(disposables);
  }
}

/**
 * Wait for all streams to complete, then emit an array of their final values.
 * If any stream completes without emitting, the result completes empty.
 */
export const forkJoin = <A, E>(...events: Event<A, E>[]): Event<A[], E> =>
  _createEvent(new ForkJoinSource(events.map(_getSource)));
