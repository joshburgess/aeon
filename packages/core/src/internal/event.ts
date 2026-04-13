/**
 * Internal Event representation.
 *
 * At runtime, an Event<A, E> IS the Source<A, E> object — no wrapper,
 * no Symbol-keyed indirection. The type-level brand (EventBrand) keeps
 * them distinct in TypeScript's type system while _createEvent and
 * _getSource compile to identity casts with zero runtime cost.
 *
 * This matches @most/core's approach where Stream = Source at runtime.
 */

import type { Disposable, Event, Scheduler, Sink, Source } from "aeon-types"

/** A Source that supports synchronous iteration (sync loop compilation). */
export interface SyncSource<A, E = never> extends Source<A, E> {
  readonly _sync: boolean
  syncIterate(emit: (value: A) => boolean): void
}

/** Type guard: does this source support sync iteration? */
export const isSyncSource = <A, E>(source: Source<A, E>): source is SyncSource<A, E> =>
  (source as SyncSource<A, E>)._sync === true

/** Create an opaque Event from a Source. Zero-cost identity cast. */
export const _createEvent = <A, E = never>(source: Source<A, E>): Event<A, E> =>
  source as unknown as Event<A, E>

/** Extract the Source from an opaque Event. Zero-cost identity cast. */
export const _getSource = <A, E = never>(event: Event<A, E>): Source<A, E> =>
  event as unknown as Source<A, E>

/** Run an Event by connecting it to a Sink via a Scheduler. Internal use only. */
export const _runEvent = <A, E>(
  event: Event<A, E>,
  sink: Sink<A, E>,
  scheduler: Scheduler,
): Disposable => _getSource(event).run(sink, scheduler)
