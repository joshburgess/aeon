/**
 * merge combinator.
 *
 * Denotation: `merge(e1, e2, ...) = sort by time (e1 ++ e2 ++ ...)`
 * Ends when ALL sources have ended.
 *
 * Uses monomorphic Sink/Source classes for V8 hidden class stability.
 */

import type { Disposable, Event, Scheduler, Sink, Source, Time } from "@pulse/types";
import { disposeAll, disposeNone } from "../internal/dispose.js";
import { _createEvent, _getSource } from "../internal/event.js";

class MergeSink<A, E> implements Sink<A, E> {
  declare readonly sink: Sink<A, E>;
  declare remaining: number;

  constructor(sink: Sink<A, E>, count: number) {
    this.sink = sink;
    this.remaining = count;
  }

  event(time: Time, value: A): void {
    this.sink.event(time, value);
  }

  error(time: Time, err: E): void {
    this.sink.error(time, err);
  }

  end(time: Time): void {
    this.remaining--;
    if (this.remaining === 0) {
      this.sink.end(time);
    }
  }
}

class MergeSource<A, E> implements Source<A, E> {
  declare readonly sources: Source<A, E>[];

  constructor(sources: Source<A, E>[]) {
    this.sources = sources;
  }

  run(sink: Sink<A, E>, scheduler: Scheduler): Disposable {
    const sources = this.sources;
    const mergeSink = new MergeSink(sink, sources.length);
    const disposables = new Array<Disposable>(sources.length);
    for (let i = 0; i < sources.length; i++) {
      disposables[i] = sources[i]!.run(mergeSink, scheduler);
    }
    return disposeAll(disposables);
  }
}

class EmptyMergeSource<A, E> implements Source<A, E> {
  run(sink: Sink<A, E>, scheduler: Scheduler): Disposable {
    sink.end(scheduler.currentTime());
    return disposeNone;
  }
}

const EMPTY_MERGE = new EmptyMergeSource<never, never>();

/**
 * Merge multiple Event streams into one, interleaving values by time.
 * Ends when all input streams have ended.
 */
export const merge = <A, E>(...events: Event<A, E>[]): Event<A, E> => {
  if (events.length === 0) {
    return _createEvent(EMPTY_MERGE as unknown as Source<A, E>);
  }
  if (events.length === 1) return events[0]!;

  const sources = new Array<Source<A, E>>(events.length);
  for (let i = 0; i < events.length; i++) {
    sources[i] = _getSource(events[i]!);
  }
  return _createEvent(new MergeSource(sources));
};
