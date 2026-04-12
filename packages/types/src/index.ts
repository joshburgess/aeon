// aeon-types — Core interfaces, HKT encoding, branded types

export {
  type Time,
  type Duration,
  type Offset,
  toTime,
  toDuration,
  toOffset,
  timeDiff,
  timeAdd,
  timeShift,
  TIME_ZERO,
  DURATION_ZERO,
  OFFSET_ZERO,
} from "./branded.js";

export {
  type URItoKind,
  type URIS,
  type Kind,
  type Functor,
  type Applicative,
  type Monad,
  type Filterable,
  liftA2,
  liftA3,
} from "./hkt.js";

export {
  type Disposable,
  type Sink,
  type Source,
  type Task,
  type ScheduledTask,
  type Scheduler,
  type Event,
  type Behavior,
  EventURI,
  type EventURI as EventURIType,
  BehaviorURI,
  type BehaviorURI as BehaviorURIType,
} from "./interfaces.js";
