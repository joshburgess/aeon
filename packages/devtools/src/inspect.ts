/**
 * inspect — extract the operator chain as a serializable tree.
 *
 * Walks the Source object graph by looking for known properties
 * (source, sources, f, predicate, n, etc.) to reconstruct the pipeline.
 */

import type { Event as AeonEvent } from "aeon-types"
import { getLabel } from "./label.js"

/** A node in the stream graph tree. */
export interface StreamNode {
  /** The operator or source type name (e.g., "map", "filter", "fromArray"). */
  readonly type: string
  /** Debug label, if attached via label(). */
  readonly label?: string
  /** Child nodes (upstream sources). */
  readonly children: readonly StreamNode[]
}

/**
 * Inspect a aeon Event and return its operator chain as a serializable tree.
 *
 * This uses heuristic property detection on Source objects to identify
 * operator types. It works with all built-in Aeon operators but may
 * not recognize custom Source implementations.
 *
 * ```typescript
 * const pipeline = map(x => x * 2, filter(x => x > 0, fromArray([1, 2, 3])));
 * const tree = inspect(pipeline);
 * // { type: "map", children: [{ type: "filter", children: [{ type: "source", children: [] }] }] }
 * ```
 */
export const inspect = <A, E>(event: AeonEvent<A, E>): StreamNode => {
  return inspectSource(event as unknown as Record<string, unknown>)
}

const inspectSource = (source: Record<string, unknown>): StreamNode => {
  const label = getLabel(source)
  const ctor = source.constructor?.name ?? "unknown"

  // Labeled source — unwrap and inspect inner
  if (label !== undefined && "source" in source) {
    const inner = inspectSource(source["source"] as Record<string, unknown>)
    return { type: inner.type, label, children: inner.children }
  }

  // Detect operator type from constructor name or shape
  const type = classifySource(source, ctor)

  // Collect children (upstream sources)
  const children: StreamNode[] = []

  if ("source" in source && source["source"] != null) {
    children.push(inspectSource(source["source"] as Record<string, unknown>))
  }

  if ("sources" in source && Array.isArray(source["sources"])) {
    for (const s of source["sources"]) {
      children.push(inspectSource(s as Record<string, unknown>))
    }
  }

  const node: StreamNode = { type, children }
  if (label !== undefined) {
    return { ...node, label }
  }
  return node
}

const classifySource = (source: Record<string, unknown>, ctorName: string): string => {
  // Try constructor name first — works for all Aeon built-in sources
  const nameMap: Record<string, string> = {
    MapSource: "map",
    FilterSource: "filter",
    FilterMapSource: "filterMap",
    MapFilterSource: "mapFilter",
    TapSource: "tap",
    ScanSource: "scan",
    TakeSource: "take",
    DropSource: "drop",
    TakeWhileSource: "takeWhile",
    DropWhileSource: "dropWhile",
    UntilSource: "until",
    SinceSource: "since",
    MergeSource: "merge",
    CombineSource: "combine",
    ZipSource: "zip",
    SwitchSource: "switchLatest",
    MergeMapSource: "mergeMap",
    TraverseSource: "traverse",
    ChainSource: "chain",
    CatchErrorSource: "catchError",
    MapErrorSource: "mapError",
    ThrowErrorSource: "throwError",
    DebounceSource: "debounce",
    ThrottleSource: "throttle",
    DelaySource: "delay",
    BufferCountSource: "bufferCount",
    BufferTimeSource: "bufferTime",
    EmptySource: "empty",
    NeverSource: "never",
    NowSource: "now",
    AtSource: "at",
    ArraySource: "fromArray",
    IterableSource: "fromIterable",
    PeriodicSource: "periodic",
    MulticastSource: "multicast",
    LabeledSource: "label",
    TraceSource: "trace",
    EmptySliceSource: "empty",
    EmptyMergeSource: "empty",
    DOMEventSource: "fromDOMEvent",
    AnimationFrameSource: "animationFrames",
    MarbleSource: "testEvent",
    FromPromiseSource: "fromPromise",
    RetrySource: "retry",
    ShareSource: "share",
    AttachSource: "attach",
    DedupeSource: "dedupe",
    ConsSource: "cons",
    FirstSource: "first",
    LastSource: "last",
    PairwiseSource: "pairwise",
    TimeoutSource: "timeout",
    ExhaustMapSource: "exhaustMap",
    ForkJoinSource: "forkJoin",
    OrElseSource: "orElse",
    EnsureSource: "ensure",
    RaceSource: "race",
    CountSource: "count",
    AllSource: "all",
    ElementAtSource: "elementAt",
    RangeSource: "range",
    ConstantSource: "constant",
    SliceSource: "slice",
  }

  if (ctorName in nameMap) {
    return nameMap[ctorName]!
  }

  // Fallback: detect by shape
  if ("f" in source && "predicate" in source && "source" in source) return "filterMap"
  if ("predicate" in source && "source" in source) return "filter"
  if ("f" in source && "source" in source) return "map"
  if ("sources" in source) return "merge"
  if ("values" in source) return "fromArray"
  if ("value" in source) return "now"
  if ("period" in source) return "periodic"

  return ctorName !== "Object" ? ctorName : "source"
}
