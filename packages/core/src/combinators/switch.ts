/**
 * switchLatest combinator.
 *
 * Denotation: given an Event of Events, always listens to the most
 * recently emitted inner Event, disposing previous subscriptions.
 *
 * Uses monomorphic Sink/Source classes for V8 hidden class stability.
 */

import type { Disposable, Event, Scheduler, Sink, Source, Time } from "aeon-types"
import { SettableDisposable } from "../internal/dispose.js"
import { _createEvent, _getSource } from "../internal/event.js"

class SwitchInnerSink<A, E> implements Sink<A, E> {
  declare readonly outer: SwitchSink<A, E>

  constructor(outer: SwitchSink<A, E>) {
    this.outer = outer
  }

  event(time: Time, value: A): void {
    this.outer.sink.event(time, value)
  }

  error(time: Time, err: E): void {
    this.outer.sink.error(time, err)
  }

  end(time: Time): void {
    this.outer.innerEnded = true
    if (this.outer.outerEnded) {
      this.outer.sink.end(time)
    }
  }
}

class SwitchSink<A, E> implements Sink<Event<A, E>, E> {
  declare readonly sink: Sink<A, E>
  declare readonly scheduler: Scheduler
  declare readonly outerDisposable: SettableDisposable
  declare innerDisposable: Disposable | undefined
  declare outerEnded: boolean
  declare innerEnded: boolean

  constructor(sink: Sink<A, E>, scheduler: Scheduler, outerDisposable: SettableDisposable) {
    this.sink = sink
    this.scheduler = scheduler
    this.outerDisposable = outerDisposable
    this.innerDisposable = undefined
    this.outerEnded = false
    this.innerEnded = true
  }

  event(_time: Time, innerEvent: Event<A, E>): void {
    if (this.innerDisposable !== undefined) {
      this.innerDisposable.dispose()
    }

    this.innerEnded = false
    this.innerDisposable = _getSource(innerEvent).run(new SwitchInnerSink(this), this.scheduler)
  }

  error(time: Time, err: E): void {
    this.sink.error(time, err)
  }

  end(time: Time): void {
    this.outerEnded = true
    if (this.innerEnded) {
      this.sink.end(time)
    }
  }
}

class SwitchSource<A, E> implements Source<A, E> {
  declare readonly source: Source<Event<A, E>, E>

  constructor(source: Source<Event<A, E>, E>) {
    this.source = source
  }

  run(sink: Sink<A, E>, scheduler: Scheduler): Disposable {
    const sd = new SettableDisposable()
    const switchSink = new SwitchSink(sink, scheduler, sd)
    sd.set(this.source.run(switchSink, scheduler))
    return {
      dispose() {
        sd.dispose()
        if (switchSink.innerDisposable !== undefined) {
          switchSink.innerDisposable.dispose()
        }
      },
    }
  }
}

/**
 * Switch to the latest inner Event, disposing the previous.
 *
 * Denotation: flatten an Event<Event<A, E>, E> by always following
 * the most recently emitted inner event.
 */
export const switchLatest = <A, E>(event: Event<Event<A, E>, E>): Event<A, E> =>
  _createEvent(new SwitchSource(_getSource(event)))
