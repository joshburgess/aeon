/**
 * AsyncIterator integration.
 *
 * Bridges between Event streams and the AsyncIterator protocol,
 * providing natural backpressure via pull-based async iteration.
 */

import type { Disposable, Event, Scheduler, Sink, Time } from "aeon-types"
import { _createEvent, _getSource } from "./internal/event.js"

/**
 * Convert an Event to an AsyncIterableIterator.
 *
 * Backpressure: the source pushes into a buffer. The consumer pulls
 * via `next()`. If the consumer is slower than the producer, values
 * buffer in memory.
 */
export const toAsyncIterator = <A, E>(
  event: Event<A, E>,
  scheduler: Scheduler,
): AsyncIterableIterator<A> & Disposable => {
  type QueueItem = { tag: "value"; value: A } | { tag: "error"; error: E } | { tag: "end" }

  const queue: QueueItem[] = []
  let resolve: ((result: IteratorResult<A>) => void) | undefined
  let reject: ((error: E) => void) | undefined
  let done = false

  const source = _getSource(event)
  const disposable = source.run(
    {
      event(_time: Time, value: A) {
        if (resolve) {
          const r = resolve
          resolve = undefined
          r({ value, done: false })
        } else {
          queue.push({ tag: "value", value })
        }
      },
      error(_time: Time, err: E) {
        done = true
        if (reject) {
          const r = reject
          reject = undefined
          r(err)
        } else {
          queue.push({ tag: "error", error: err })
        }
      },
      end(_time: Time) {
        done = true
        if (resolve) {
          const r = resolve
          resolve = undefined
          r({ value: undefined, done: true })
        } else {
          queue.push({ tag: "end" })
        }
      },
    },
    scheduler,
  )

  const iterator: AsyncIterableIterator<A> & Disposable = {
    next(): Promise<IteratorResult<A>> {
      if (queue.length > 0) {
        const item = queue.shift()!
        switch (item.tag) {
          case "value":
            return Promise.resolve({ value: item.value, done: false })
          case "error":
            return Promise.reject(item.error)
          case "end":
            return Promise.resolve({ value: undefined as A, done: true })
        }
      }

      if (done) {
        return Promise.resolve({ value: undefined as A, done: true })
      }

      return new Promise<IteratorResult<A>>((res, rej) => {
        resolve = res
        reject = rej as (error: E) => void
      })
    },

    return(): Promise<IteratorResult<A>> {
      done = true
      disposable.dispose()
      return Promise.resolve({ value: undefined as A, done: true })
    },

    [Symbol.asyncIterator]() {
      return this
    },

    dispose() {
      done = true
      disposable.dispose()
    },
  }

  return iterator
}

/**
 * Create an Event from an AsyncIterable.
 *
 * The async iterable is pulled eagerly — each value is pushed
 * to subscribers as soon as it's available.
 */
export const fromAsyncIterable = <A>(iterable: AsyncIterable<A>): Event<A, never> =>
  _createEvent({
    run(sink: Sink<A, never>, scheduler: Scheduler): Disposable {
      let disposed = false

      ;(async () => {
        try {
          for await (const value of iterable) {
            if (disposed) break
            sink.event(scheduler.currentTime(), value)
          }
          if (!disposed) {
            sink.end(scheduler.currentTime())
          }
        } catch (err) {
          if (!disposed) {
            sink.error(scheduler.currentTime(), err as never)
          }
        }
      })()

      return {
        dispose() {
          disposed = true
        },
      }
    },
  })
