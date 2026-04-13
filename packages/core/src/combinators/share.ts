/**
 * share — replay multicast.
 *
 * Like multicast, but buffers the last N values and replays them
 * to late subscribers. Useful for hot streams where late subscribers
 * need the most recent state.
 *
 * Uses monomorphic classes for V8 hidden class stability.
 */

import type { Disposable, Event, Scheduler, Sink, Source, Time } from "aeon-types"
import { _createEvent, _getSource } from "../internal/event.js"

class ReplayState<A, E> {
  declare readonly sinks: Set<Sink<A, E>>
  declare readonly buffer: { time: Time; value: A }[]
  declare readonly bufferSize: number
  declare sourceDisposable: Disposable | undefined
  declare ended: boolean
  declare endTime: Time | undefined
  declare errored: boolean
  declare errorTime: Time | undefined
  declare errorValue: E | undefined

  constructor(bufferSize: number) {
    this.sinks = new Set()
    this.buffer = []
    this.bufferSize = bufferSize
    this.sourceDisposable = undefined
    this.ended = false
    this.endTime = undefined
    this.errored = false
    this.errorTime = undefined
    this.errorValue = undefined
  }

  push(time: Time, value: A): void {
    this.buffer.push({ time, value })
    if (this.buffer.length > this.bufferSize) {
      this.buffer.shift()
    }
  }
}

class ShareSource<A, E> implements Source<A, E> {
  declare readonly source: Source<A, E>
  declare readonly state: ReplayState<A, E>

  constructor(source: Source<A, E>, bufferSize: number) {
    this.source = source
    this.state = new ReplayState(bufferSize)
  }

  run(sink: Sink<A, E>, scheduler: Scheduler): Disposable {
    const state = this.state

    // Replay buffered values to new subscriber
    for (let i = 0; i < state.buffer.length; i++) {
      const entry = state.buffer[i]!
      sink.event(entry.time, entry.value)
    }

    // If source already errored, propagate immediately
    if (state.errored) {
      sink.error(state.errorTime!, state.errorValue!)
      return { dispose() {} }
    }

    // If source already ended, end immediately
    if (state.ended) {
      sink.end(state.endTime!)
      return { dispose() {} }
    }

    state.sinks.add(sink)

    if (state.sinks.size === 1) {
      // First subscriber — connect to source
      state.sourceDisposable = this.source.run(
        {
          event(time: Time, value: A) {
            state.push(time, value)
            for (const s of state.sinks) {
              s.event(time, value)
            }
          },
          error(time: Time, err: E) {
            state.errored = true
            state.errorTime = time
            state.errorValue = err
            for (const s of state.sinks) {
              s.error(time, err)
            }
          },
          end(time: Time) {
            state.ended = true
            state.endTime = time
            for (const s of state.sinks) {
              s.end(time)
            }
          },
        },
        scheduler,
      )
    }

    return {
      dispose() {
        state.sinks.delete(sink)
        if (state.sinks.size === 0 && state.sourceDisposable !== undefined) {
          state.sourceDisposable.dispose()
          state.sourceDisposable = undefined
          // Reset state so source can be re-subscribed
          state.ended = false
          state.endTime = undefined
          state.errored = false
          state.errorTime = undefined
          state.errorValue = undefined
          state.buffer.length = 0
        }
      },
    }
  }
}

/**
 * Share a single subscription with replay for late subscribers.
 *
 * Buffers the last `bufferSize` values and replays them to new subscribers.
 * Like `multicast`, the source is subscribed lazily and disposed when
 * the last subscriber leaves.
 *
 * - `share(1, event)` — replay latest value (like RxJS `shareReplay(1)`)
 * - `share(0, event)` — equivalent to `multicast` (no replay)
 */
export const share = <A, E>(bufferSize: number, event: Event<A, E>): Event<A, E> =>
  _createEvent(new ShareSource(_getSource(event), bufferSize))
