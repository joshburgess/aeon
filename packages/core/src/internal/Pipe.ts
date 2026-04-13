/**
 * Pipe base class for sinks that forward error/end unchanged.
 *
 * With ES2022 target, `extends Pipe` compiles to native `class extends` —
 * zero helpers, zero overhead. V8 devirtualizes the shared error/end
 * methods across all sink subtypes.
 */

import type { Sink, Time } from "aeon-types"

export class Pipe<A, E> {
  declare readonly sink: Sink<A, E>

  constructor(sink: Sink<A, E>) {
    this.sink = sink
  }

  error(time: Time, err: E): void {
    this.sink.error(time, err)
  }

  end(time: Time): void {
    this.sink.end(time)
  }
}
