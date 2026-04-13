/**
 * Branded types for temporal values.
 *
 * Branding prevents accidental mixing of Time, Duration, and Offset
 * at the type level while remaining plain numbers at runtime.
 */

declare const TimeBrand: unique symbol
declare const DurationBrand: unique symbol
declare const OffsetBrand: unique symbol

/** Absolute point in time (milliseconds). Denotation: a point on the timeline. */
export type Time = number & { readonly [TimeBrand]: typeof TimeBrand }

/** Relative duration (milliseconds). Denotation: a span between two points. */
export type Duration = number & { readonly [DurationBrand]: typeof DurationBrand }

/** Scheduler-relative offset (milliseconds). Denotation: displacement from a scheduler's epoch. */
export type Offset = number & { readonly [OffsetBrand]: typeof OffsetBrand }

// --- Constructors ---

/** Wrap a raw millisecond value as a Time. */
export const toTime = (ms: number): Time => ms as Time

/** Wrap a raw millisecond value as a Duration. */
export const toDuration = (ms: number): Duration => ms as Duration

/** Wrap a raw millisecond value as an Offset. */
export const toOffset = (ms: number): Offset => ms as Offset

// --- Arithmetic ---

/** Compute the Duration between two Time points. */
export const timeDiff = (a: Time, b: Time): Duration => (a - b) as Duration

/** Advance a Time by a Duration. */
export const timeAdd = (t: Time, d: Duration): Time => (t + d) as Time

/** Advance a Time by an Offset. */
export const timeShift = (t: Time, o: Offset): Time => (t + o) as Time

// --- Constants ---

/** Time zero — the epoch. */
export const TIME_ZERO: Time = 0 as Time

/** Zero duration. */
export const DURATION_ZERO: Duration = 0 as Duration

/** Zero offset. */
export const OFFSET_ZERO: Offset = 0 as Offset
