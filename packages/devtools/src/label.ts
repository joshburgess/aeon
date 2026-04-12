/**
 * label — attach a debug name to a stream.
 *
 * The name is stored on the Source object as a non-enumerable property
 * so it's visible in debuggers but doesn't affect runtime behavior.
 */

import type { Disposable, Event as PulseEvent, Scheduler, Sink, Source, Time } from "aeon-types";

const LABEL_KEY = Symbol("pulse/label");

export interface Labeled {
  readonly [LABEL_KEY]: string;
}

/** Check if a source has a debug label. */
export const getLabel = (source: unknown): string | undefined =>
  (source as Partial<Labeled>)[LABEL_KEY];

class LabeledSource<A, E> implements Source<A, E> {
  declare readonly source: Source<A, E>;
  declare readonly [LABEL_KEY]: string;

  constructor(name: string, source: Source<A, E>) {
    this.source = source;
    this[LABEL_KEY] = name;
  }

  run(sink: Sink<A, E>, scheduler: Scheduler): Disposable {
    return this.source.run(sink, scheduler);
  }
}

/**
 * Attach a debug label to a stream.
 *
 * The label has zero runtime overhead — it's only visible via `inspect()`
 * or `getLabel()`. Useful for identifying streams in debug output.
 *
 * ```typescript
 * const clicks = label("user-clicks", fromDOMEvent("click", button));
 * ```
 */
export const label = <A, E>(name: string, event: PulseEvent<A, E>): PulseEvent<A, E> => {
  const source = event as unknown as Source<A, E>;
  return new LabeledSource(name, source) as unknown as PulseEvent<A, E>;
};
