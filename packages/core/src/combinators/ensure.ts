/**
 * ensure combinator.
 *
 * Denotation: run a side-effect function when the stream ends or errors.
 * The cleanup runs exactly once.
 */

import type { Disposable, Event, Scheduler, Sink, Source, Time } from "aeon-types"
import { Pipe } from "../internal/Pipe.js"
import { _createEvent, _getSource } from "../internal/event.js"

class EnsureSink<A, E> extends Pipe<A, E> {
  declare readonly cleanup: () => void
  declare called: boolean

  constructor(cleanup: () => void, sink: Sink<A, E>) {
    super(sink)
    this.cleanup = cleanup
    this.called = false
  }

  event(time: Time, value: A): void {
    this.sink.event(time, value)
  }

  error(time: Time, err: E): void {
    this.runCleanup()
    this.sink.error(time, err)
  }

  end(time: Time): void {
    this.runCleanup()
    this.sink.end(time)
  }

  runCleanup(): void {
    if (!this.called) {
      this.called = true
      this.cleanup()
    }
  }
}

class EnsureSource<A, E> implements Source<A, E> {
  declare readonly cleanup: () => void
  declare readonly source: Source<A, E>

  constructor(cleanup: () => void, source: Source<A, E>) {
    this.cleanup = cleanup
    this.source = source
  }

  run(sink: Sink<A, E>, scheduler: Scheduler): Disposable {
    const ensureSink = new EnsureSink(this.cleanup, sink)
    const d = this.source.run(ensureSink, scheduler)
    return {
      dispose() {
        ensureSink.runCleanup()
        d.dispose()
      },
    }
  }
}

/**
 * Run a cleanup function when the stream ends, errors, or is disposed.
 * The cleanup runs exactly once regardless of which termination path fires.
 */
export const ensure = <A, E>(cleanup: () => void, event: Event<A, E>): Event<A, E> =>
  _createEvent(new EnsureSource(cleanup, _getSource(event)))
