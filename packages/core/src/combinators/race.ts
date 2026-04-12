/**
 * race combinator.
 *
 * Denotation: the first stream to emit wins. All others are disposed.
 * If any stream errors before the first event, the error propagates.
 */

import type { Disposable, Event, Scheduler, Sink, Source, Time } from "aeon-types";
import { _createEvent, _getSource } from "../internal/event.js";

class RaceSink<A, E> implements Sink<A, E> {
  declare readonly sink: Sink<A, E>;
  declare readonly index: number;
  declare readonly state: RaceState<A, E>;

  constructor(sink: Sink<A, E>, index: number, state: RaceState<A, E>) {
    this.sink = sink;
    this.index = index;
    this.state = state;
  }

  event(time: Time, value: A): void {
    if (this.state.winner === -1) {
      this.state.winner = this.index;
      // Dispose all losers
      for (let i = 0; i < this.state.disposables.length; i++) {
        if (i !== this.index) {
          this.state.disposables[i]?.dispose();
        }
      }
    }
    if (this.state.winner === this.index) {
      this.sink.event(time, value);
    }
  }

  error(time: Time, err: E): void {
    if (this.state.winner === -1 || this.state.winner === this.index) {
      this.sink.error(time, err);
    }
  }

  end(time: Time): void {
    if (this.state.winner === this.index) {
      this.sink.end(time);
    } else if (this.state.winner === -1) {
      // A source ended without emitting — count it out
      this.state.endedCount++;
      if (this.state.endedCount === this.state.disposables.length) {
        this.sink.end(time);
      }
    }
  }
}

class RaceState<A, E> {
  declare winner: number;
  declare endedCount: number;
  declare readonly disposables: (Disposable | undefined)[];

  constructor(count: number) {
    this.winner = -1;
    this.endedCount = 0;
    this.disposables = new Array(count).fill(undefined) as (Disposable | undefined)[];
  }
}

class RaceSource<A, E> implements Source<A, E> {
  declare readonly sources: Source<A, E>[];

  constructor(sources: Source<A, E>[]) {
    this.sources = sources;
  }

  run(sink: Sink<A, E>, scheduler: Scheduler): Disposable {
    const count = this.sources.length;
    if (count === 0) {
      sink.end(scheduler.currentTime());
      return { dispose() {} };
    }

    const state = new RaceState<A, E>(count);

    for (let i = 0; i < count; i++) {
      state.disposables[i] = this.sources[i]!.run(new RaceSink(sink, i, state), scheduler);
    }

    return {
      dispose() {
        for (const d of state.disposables) {
          d?.dispose();
        }
      },
    };
  }
}

/**
 * Race multiple streams: the first to emit wins, others are disposed.
 * Subsequent events come only from the winner.
 */
export const race = <A, E>(...events: Event<A, E>[]): Event<A, E> =>
  _createEvent(new RaceSource(events.map(_getSource)));
