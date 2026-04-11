/**
 * constant combinator.
 *
 * Denotation: `constant(b, e) = [(t, b) | (t, _) ∈ e]`
 */

import type { Event } from "@pulse/types";
import { map } from "./map.js";

/**
 * Replace every value in the stream with a constant.
 *
 * Denotation: `constant(b, e) = map(_ => b, e)`
 */
export const constant = <A, B, E>(value: B, event: Event<A, E>): Event<B, E> =>
  map(() => value, event);
