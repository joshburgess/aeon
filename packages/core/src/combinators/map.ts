/**
 * map combinator.
 *
 * Denotation: `map(f, e) = [(t, f(v)) | (t, v) ∈ e]`
 *
 * Uses pipeline fusion: map∘map is collapsed into a single map with
 * a composed function. map∘filter becomes a filterMap node.
 */

import type { Event } from "aeon-types";
import { fusedMap } from "../internal/fusion.js";

/**
 * Transform each value in an Event stream.
 *
 * Denotation: `map(f, e) = [(t, f(v)) | (t, v) ∈ e]`
 */
export const map = <A, B, E>(f: (a: A) => B, event: Event<A, E>): Event<B, E> => fusedMap(f, event);
