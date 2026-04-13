/**
 * trace — log every event, error, and end with timestamps.
 *
 * Wraps a stream with a tap-like sink that logs to console.
 * The stream's values pass through unchanged.
 */

import type { Event as AeonEvent, Disposable, Scheduler, Sink, Source, Time } from "aeon-types"
import { getLabel } from "./label.js"

/** Options for trace output. */
export interface TraceOptions {
  /** Label prefix for log lines. Defaults to the stream's label or "trace". */
  readonly label?: string
  /** Custom logger function. Defaults to console.log. */
  readonly log?: (...args: unknown[]) => void
}

class TraceSink<A, E> implements Sink<A, E> {
  declare readonly sink: Sink<A, E>
  declare readonly prefix: string
  declare readonly log: (...args: unknown[]) => void

  constructor(sink: Sink<A, E>, prefix: string, log: (...args: unknown[]) => void) {
    this.sink = sink
    this.prefix = prefix
    this.log = log
  }

  event(time: Time, value: A): void {
    this.log(`[${this.prefix}] event(${time as number})`, value)
    this.sink.event(time, value)
  }

  error(time: Time, err: E): void {
    this.log(`[${this.prefix}] error(${time as number})`, err)
    this.sink.error(time, err)
  }

  end(time: Time): void {
    this.log(`[${this.prefix}] end(${time as number})`)
    this.sink.end(time)
  }
}

class TraceSource<A, E> implements Source<A, E> {
  declare readonly source: Source<A, E>
  declare readonly prefix: string
  declare readonly logFn: (...args: unknown[]) => void

  constructor(source: Source<A, E>, prefix: string, logFn: (...args: unknown[]) => void) {
    this.source = source
    this.prefix = prefix
    this.logFn = logFn
  }

  run(sink: Sink<A, E>, scheduler: Scheduler): Disposable {
    return this.source.run(new TraceSink(sink, this.prefix, this.logFn), scheduler)
  }
}

/**
 * Log every event, error, and end to the console (or a custom logger).
 *
 * Values pass through unchanged — this is a transparent debugging tap.
 *
 * ```typescript
 * const debugged = trace(myStream);
 * // [trace] event(0) 42
 * // [trace] event(1) 43
 * // [trace] end(2)
 *
 * const named = trace(label("clicks", clickStream));
 * // [clicks] event(150) MouseEvent { ... }
 * ```
 */
export const trace = <A, E>(event: AeonEvent<A, E>, options?: TraceOptions): AeonEvent<A, E> => {
  const source = event as unknown as Source<A, E>
  const prefix = options?.label ?? getLabel(source) ?? "trace"
  const logFn = options?.log ?? console.log
  return new TraceSource(source, prefix, logFn) as unknown as AeonEvent<A, E>
}
