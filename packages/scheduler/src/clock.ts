/**
 * Clock abstractions.
 *
 * A Clock is the single source of truth for "what time is it."
 * Different clocks serve different purposes: real time for production,
 * virtual time for testing.
 */

import { type Time, toTime } from "aeon-types"

/** A source of time. */
export interface Clock {
  now(): Time
}

/** Clock using performance.now() — high-resolution, monotonic. */
export class PerformanceClock implements Clock {
  now(): Time {
    return toTime(performance.now())
  }
}

/** Clock using Date.now() — fallback for environments without performance API. */
export class DateClock implements Clock {
  now(): Time {
    return toTime(Date.now())
  }
}

/** Manually advanceable clock for deterministic testing. */
export class VirtualClock implements Clock {
  private declare time: Time

  constructor(initialTime: Time = toTime(0)) {
    this.time = initialTime
  }

  now(): Time {
    return this.time
  }

  setTime(time: Time): void {
    this.time = time
  }

  advance(ms: number): void {
    this.time = toTime((this.time as number) + ms)
  }
}
