// aeon-types — Core interfaces and branded types

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

export type {
  Disposable,
  Sink,
  Source,
  Task,
  ScheduledTask,
  Scheduler,
  Event,
  Behavior,
} from "./interfaces.js";
