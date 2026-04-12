/**
 * merge combinator.
 *
 * Denotation: `merge(e1, e2, ...) = sort by time (e1 ++ e2 ++ ...)`
 * Ends when ALL sources have ended.
 *
 * Uses monomorphic Sink/Source classes for V8 hidden class stability.
 */

import type { Disposable, Event, Scheduler, Sink, Source, Time } from "aeon-types";
import { disposeAll, disposeNone } from "../internal/dispose.js";
import { type SyncSource, _createEvent, _getSource } from "../internal/event.js";

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
  declare readonly _sync: boolean;

  constructor(sources: Source<A, E>[]) {
    this.sources = sources;
    let sync = true;
    for (let i = 0; i < sources.length; i++) {
      if ((sources[i] as SyncSource<A, E>)._sync !== true) {
        sync = false;
        break;
      }
    }
    this._sync = sync;
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

  syncIterate(emit: (value: A) => boolean): void {
    const sources = this.sources;
    let active = true;
    const wrappedEmit = (v: A) => {
      active = emit(v);
      return active;
    };
    for (let i = 0; i < sources.length && active; i++) {
      (sources[i]! as SyncSource<A, E>).syncIterate(wrappedEmit);
    }
  }
}

class EmptyMergeSource<A, E> implements Source<A, E> {
  declare readonly _sync: true;

  constructor() {
    this._sync = true;
  }

  run(sink: Sink<A, E>, scheduler: Scheduler): Disposable {
    sink.end(scheduler.currentTime());
    return disposeNone;
  }

  syncIterate(_emit: (value: A) => boolean): void {}
}

const EMPTY_MERGE = new EmptyMergeSource<never, never>();

/**
 * Merge multiple Event streams into one, interleaving values by time.
 * Ends when all input streams have ended.
 *
 * Flattens nested merges: merge(a, merge(b, c)) → merge(a, b, c)
 */
export const merge = <A, E>(...events: Event<A, E>[]): Event<A, E> => {
  if (events.length === 0) {
    return _createEvent(EMPTY_MERGE as unknown as Source<A, E>);
  }
  if (events.length === 1) return events[0]!;

  // Flatten nested merges and collect sources
  const sources: Source<A, E>[] = [];
  for (let i = 0; i < events.length; i++) {
    const source = _getSource(events[i]!);
    if (source instanceof MergeSource) {
      // Flatten: merge(a, merge(b, c)) → merge(a, b, c)
      const inner = source.sources;
      for (let j = 0; j < inner.length; j++) {
        sources.push(inner[j]!);
      }
    } else {
      sources.push(source);
    }
  }

  if (sources.length === 1) {
    return _createEvent(sources[0]!);
  }

  return _createEvent(new MergeSource(sources));
};
