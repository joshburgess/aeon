/**
 * orElse combinator.
 *
 * Denotation: if the stream completes without emitting any values,
 * emit a default value before ending.
 */

import type { Disposable, Event, Scheduler, Sink, Source, Time } from "aeon-types";
import { Pipe } from "../internal/Pipe.js";
import { _createEvent, _getSource } from "../internal/event.js";

class OrElseSink<A, E> extends Pipe<A, E> {
  declare readonly defaultValue: A;
  declare hasValue: boolean;

  constructor(defaultValue: A, sink: Sink<A, E>) {
    super(sink);
    this.defaultValue = defaultValue;
    this.hasValue = false;
  }

  event(time: Time, value: A): void {
    this.hasValue = true;
    this.sink.event(time, value);
  }

  end(time: Time): void {
    if (!this.hasValue) {
      this.sink.event(time, this.defaultValue);
    }
    this.sink.end(time);
  }
}

class OrElseSource<A, E> implements Source<A, E> {
  declare readonly defaultValue: A;
  declare readonly source: Source<A, E>;

  constructor(defaultValue: A, source: Source<A, E>) {
    this.defaultValue = defaultValue;
    this.source = source;
  }

  run(sink: Sink<A, E>, scheduler: Scheduler): Disposable {
    return this.source.run(new OrElseSink(this.defaultValue, sink), scheduler);
  }
}

/**
 * Emit a default value if the stream completes without producing any values.
 *
 * Denotation: `orElse(d, e) = isEmpty(e) ? [(t_end, d)] : e`
 */
export const orElse = <A, E>(defaultValue: A, event: Event<A, E>): Event<A, E> =>
  _createEvent(new OrElseSource(defaultValue, _getSource(event)));
