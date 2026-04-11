/**
 * Pipeline fusion IR.
 *
 * At Event construction time, instead of immediately creating Sink chains,
 * we detect fusible patterns (map∘map, filter∘filter, filter∘map, etc.)
 * and collapse them into a single operation.
 *
 * Uses proper classes with instanceof checks for V8 hidden class stability.
 * All sinks extend Pipe for shared error/end — with ES2022 target this
 * compiles to native `class extends`, zero overhead.
 */

import type { Disposable, Event, Scheduler, Sink, Source, Time } from "@pulse/types";
import { _createEvent, _getSource } from "./event.js";
import { Pipe } from "./Pipe.js";

// --- Sink classes ---

/** Map sink: applies f to each value. */
class MapSink<A, B, E> extends Pipe<B, E> implements Sink<A, E> {
  declare readonly f: (a: A) => B;

  constructor(f: (a: A) => B, sink: Sink<B, E>) {
    super(sink);
    this.f = f;
  }

  event(time: Time, value: A): void {
    const f = this.f;
    this.sink.event(time, f(value));
  }
}

/** Filter sink: only forwards values that pass the predicate. */
class FilterSink<A, E> extends Pipe<A, E> {
  declare readonly predicate: (a: A) => boolean;

  constructor(predicate: (a: A) => boolean, sink: Sink<A, E>) {
    super(sink);
    this.predicate = predicate;
  }

  event(time: Time, value: A): void {
    const p = this.predicate;
    if (p(value)) {
      this.sink.event(time, value);
    }
  }
}

/** Combined filter+map sink: filter then map in one node. */
class FilterMapSink<A, B, E> extends Pipe<B, E> implements Sink<A, E> {
  declare readonly predicate: (a: A) => boolean;
  declare readonly f: (a: A) => B;

  constructor(predicate: (a: A) => boolean, f: (a: A) => B, sink: Sink<B, E>) {
    super(sink);
    this.predicate = predicate;
    this.f = f;
  }

  event(time: Time, value: A): void {
    const p = this.predicate;
    if (p(value)) {
      const f = this.f;
      this.sink.event(time, f(value));
    }
  }
}

/** Combined map+filter sink: map then filter in one node. */
class MapFilterSink<A, B, E> extends Pipe<B, E> implements Sink<A, E> {
  declare readonly f: (a: A) => B;
  declare readonly predicate: (b: B) => boolean;

  constructor(f: (a: A) => B, predicate: (b: B) => boolean, sink: Sink<B, E>) {
    super(sink);
    this.f = f;
    this.predicate = predicate;
  }

  event(time: Time, value: A): void {
    const f = this.f;
    const mapped = f(value);
    const p = this.predicate;
    if (p(mapped)) {
      this.sink.event(time, mapped);
    }
  }
}

// --- Source classes (for instanceof fusion detection) ---

/** A map source, tagged for fusion detection via instanceof. */
class MapSource<A, B, E> implements Source<B, E> {
  declare readonly f: (a: A) => B;
  declare readonly source: Source<A, E>;

  constructor(f: (a: A) => B, source: Source<A, E>) {
    this.f = f;
    this.source = source;
  }

  run(sink: Sink<B, E>, scheduler: Scheduler): Disposable {
    return this.source.run(new MapSink(this.f, sink), scheduler);
  }

  /** Factory with fusion: collapses map∘map and map∘filter. */
  static create<A, B, E>(f: (a: A) => B, source: Source<A, E>): Source<B, E> {
    // map(f, map(g, s)) → map(f∘g, s)
    if (source instanceof MapSource) {
      const inner = source as MapSource<unknown, A, E>;
      return new MapSource((x: unknown) => f(inner.f(x)), inner.source);
    }

    // map(f, filter(p, s)) → filterMap(p, f, s)
    if (source instanceof FilterSource) {
      const inner = source as FilterSource<A, E>;
      return new FilterMapSource(inner.predicate, f, inner.source);
    }

    return new MapSource(f, source);
  }
}

/** A filter source, tagged for fusion detection via instanceof. */
class FilterSource<A, E> implements Source<A, E> {
  declare readonly predicate: (a: A) => boolean;
  declare readonly source: Source<A, E>;

  constructor(predicate: (a: A) => boolean, source: Source<A, E>) {
    this.predicate = predicate;
    this.source = source;
  }

  run(sink: Sink<A, E>, scheduler: Scheduler): Disposable {
    return this.source.run(new FilterSink(this.predicate, sink), scheduler);
  }

  /** Factory with fusion: collapses filter∘filter and filter∘map. */
  static create<A, E>(predicate: (a: A) => boolean, source: Source<A, E>): Source<A, E> {
    // filter(p, filter(q, s)) → filter(x => q(x) && p(x), s)
    if (source instanceof FilterSource) {
      const inner = source as FilterSource<A, E>;
      return new FilterSource(
        (x: A) => inner.predicate(x) && predicate(x),
        inner.source,
      );
    }

    // filter(p, map(f, s)) → mapFilter(f, p, s)
    if (source instanceof MapSource) {
      const inner = source as MapSource<unknown, A, E>;
      return new MapFilterSource(inner.f, predicate, inner.source);
    }

    return new FilterSource(predicate, source);
  }
}

/** Fused filter-then-map source. */
class FilterMapSource<A, B, E> implements Source<B, E> {
  declare readonly predicate: (a: A) => boolean;
  declare readonly f: (a: A) => B;
  declare readonly source: Source<A, E>;

  constructor(predicate: (a: A) => boolean, f: (a: A) => B, source: Source<A, E>) {
    this.predicate = predicate;
    this.f = f;
    this.source = source;
  }

  run(sink: Sink<B, E>, scheduler: Scheduler): Disposable {
    return this.source.run(new FilterMapSink(this.predicate, this.f, sink), scheduler);
  }
}

/** Fused map-then-filter source. */
class MapFilterSource<A, B, E> implements Source<B, E> {
  declare readonly f: (a: A) => B;
  declare readonly predicate: (b: B) => boolean;
  declare readonly source: Source<A, E>;

  constructor(f: (a: A) => B, predicate: (b: B) => boolean, source: Source<A, E>) {
    this.f = f;
    this.predicate = predicate;
    this.source = source;
  }

  run(sink: Sink<B, E>, scheduler: Scheduler): Disposable {
    return this.source.run(new MapFilterSink(this.f, this.predicate, sink), scheduler);
  }
}

// --- Public API ---

/**
 * Create a fusible map Event. Detects map∘map and composes functions.
 */
export const fusedMap = <A, B, E>(f: (a: A) => B, event: Event<A, E>): Event<B, E> => {
  const source = _getSource(event);
  return _createEvent(MapSource.create(f, source));
};

/**
 * Create a fusible filter Event. Detects filter∘filter and conjoins predicates.
 */
export const fusedFilter = <A, E>(
  predicate: (a: A) => boolean,
  event: Event<A, E>,
): Event<A, E> => {
  const source = _getSource(event);
  return _createEvent(FilterSource.create(predicate, source));
};
