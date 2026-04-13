/**
 * filter combinator.
 *
 * Denotation: `filter(p, e) = [(t, v) | (t, v) ∈ e, p(v)]`
 *
 * Uses pipeline fusion: filter∘filter is collapsed into a single filter
 * with conjoined predicates. filter∘map becomes a mapFilter node.
 */

import type { Event } from "aeon-types"
import { fusedFilter } from "../internal/fusion.js"

/**
 * Keep only values that satisfy the predicate.
 *
 * Denotation: `filter(p, e) = [(t, v) | (t, v) ∈ e, p(v)]`
 */
export const filter = <A, E>(predicate: (a: A) => boolean, event: Event<A, E>): Event<A, E> =>
  fusedFilter(predicate, event)
