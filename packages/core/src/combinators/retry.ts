/**
 * retry combinator.
 *
 * Denotation: on error, re-subscribe to the source up to `maxRetries` times.
 * Optionally delays each retry.
 *
 * Uses monomorphic Sink/Source classes for V8 hidden class stability.
 */

import type { Disposable, Duration, Event, Scheduler, Sink, Source, Time } from "aeon-types"
import { SettableDisposable } from "../internal/dispose.js"
import { _createEvent, _getSource } from "../internal/event.js"

class RetrySink<A, E> implements Sink<A, E> {
  declare readonly sink: Sink<A, E>
  declare readonly source: Source<A, E>
  declare readonly scheduler: Scheduler
  declare readonly disposable: SettableDisposable
  declare readonly maxRetries: number
  declare readonly delayDuration: Duration | undefined
  declare attempt: number

  constructor(
    sink: Sink<A, E>,
    source: Source<A, E>,
    scheduler: Scheduler,
    disposable: SettableDisposable,
    maxRetries: number,
    delayDuration: Duration | undefined,
  ) {
    this.sink = sink
    this.source = source
    this.scheduler = scheduler
    this.disposable = disposable
    this.maxRetries = maxRetries
    this.delayDuration = delayDuration
    this.attempt = 0
  }

  event(time: Time, value: A): void {
    this.sink.event(time, value)
  }

  error(time: Time, err: E): void {
    this.attempt++
    if (this.attempt > this.maxRetries) {
      this.sink.error(time, err)
      return
    }

    if (this.delayDuration !== undefined) {
      const self = this
      const st = this.scheduler.scheduleTask(this.delayDuration, {
        run() {
          self.disposable.set(self.source.run(self, self.scheduler))
        },
        error(t: Time, e: unknown) {
          self.sink.error(t, e as E)
        },
        dispose() {},
      })
      this.disposable.set(st)
    } else {
      this.disposable.set(this.source.run(this, this.scheduler))
    }
  }

  end(time: Time): void {
    this.sink.end(time)
  }
}

class RetrySource<A, E> implements Source<A, E> {
  declare readonly source: Source<A, E>
  declare readonly maxRetries: number
  declare readonly delayDuration: Duration | undefined

  constructor(source: Source<A, E>, maxRetries: number, delayDuration: Duration | undefined) {
    this.source = source
    this.maxRetries = maxRetries
    this.delayDuration = delayDuration
  }

  run(sink: Sink<A, E>, scheduler: Scheduler): Disposable {
    const sd = new SettableDisposable()
    const retrySink = new RetrySink(
      sink,
      this.source,
      scheduler,
      sd,
      this.maxRetries,
      this.delayDuration,
    )
    sd.set(this.source.run(retrySink, scheduler))
    return sd
  }
}

/**
 * Retry a failing event stream up to `maxRetries` times.
 *
 * On error, re-subscribes to the source. If `delay` is provided,
 * waits that duration before each retry. If all retries are exhausted,
 * the error propagates downstream.
 */
export const retry = <A, E>(
  maxRetries: number,
  event: Event<A, E>,
  delay?: Duration,
): Event<A, E> => _createEvent(new RetrySource(_getSource(event), maxRetries, delay))
