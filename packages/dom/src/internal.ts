/**
 * Internal helpers for aeon-dom.
 *
 * At runtime, Event<A, E> IS Source<A, E> — the opaque type brand is
 * purely type-level. This mirrors the zero-cost identity cast in aeon-core.
 */

import type { Event, Source } from "aeon-types";

/** Create an opaque Event from a Source. Zero-cost identity cast. */
export const createEvent = <A, E = never>(source: Source<A, E>): Event<A, E> =>
  source as unknown as Event<A, E>;
