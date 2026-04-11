/**
 * DefaultScheduler — production scheduler.
 *
 * Uses a real clock and setTimeout for delayed tasks.
 * Microtask batching: tasks scheduled for "now" are flushed
 * in a single queueMicrotask call.
 */

import {
  type Duration,
  type Offset,
  type ScheduledTask,
  type Scheduler,
  type Task,
  type Time,
  timeAdd,
  toTime,
} from "@pulse/types";
import type { Clock } from "./clock.js";
import { PerformanceClock } from "./clock.js";
import { BinaryHeap, type HeapEntry } from "./heap.js";

interface PendingTask {
  readonly task: Task;
  readonly time: Time;
  cancelled: boolean;
  timerId: ReturnType<typeof setTimeout> | undefined;
  heapEntry: HeapEntry<PendingTask> | undefined;
}

export class DefaultScheduler implements Scheduler {
  declare private readonly clock: Clock;
  declare private readonly heap: BinaryHeap<PendingTask>;
  declare private microtaskQueued: boolean;
  declare private readonly microtaskBuffer: PendingTask[];

  constructor(clock: Clock = new PerformanceClock()) {
    this.clock = clock;
    this.heap = new BinaryHeap();
    this.microtaskQueued = false;
    this.microtaskBuffer = [];
  }

  currentTime(): Time {
    return this.clock.now();
  }

  scheduleTask(delay: Duration, task: Task): ScheduledTask {
    const now = this.clock.now();
    const time = timeAdd(now, delay);
    const delayMs = delay as number;

    const pending: PendingTask = {
      task,
      time,
      cancelled: false,
      timerId: undefined,
      heapEntry: undefined,
    };

    if (delayMs <= 0) {
      // Schedule as microtask
      this.microtaskBuffer.push(pending);
      if (!this.microtaskQueued) {
        this.microtaskQueued = true;
        queueMicrotask(() => this.flushMicrotasks());
      }
    } else {
      // Schedule as setTimeout
      pending.heapEntry = this.heap.insert(pending, time as number);
      pending.timerId = setTimeout(() => {
        if (!pending.cancelled) {
          if (pending.heapEntry) {
            this.heap.remove(pending.heapEntry);
          }
          this.runTask(pending);
        }
      }, delayMs);
    }

    return {
      task,
      time,
      dispose() {
        if (!pending.cancelled) {
          pending.cancelled = true;
          if (pending.timerId !== undefined) {
            clearTimeout(pending.timerId);
          }
        }
      },
    };
  }

  relative(offset: Offset): Scheduler {
    return new RelativeScheduler(offset, this);
  }

  cancelTask(st: ScheduledTask): void {
    st.dispose();
  }

  private flushMicrotasks(): void {
    this.microtaskQueued = false;
    const buffer = this.microtaskBuffer.splice(0);
    for (const pending of buffer) {
      if (!pending.cancelled) {
        this.runTask(pending);
      }
    }
  }

  private runTask(pending: PendingTask): void {
    try {
      pending.task.run(this.clock.now());
    } catch (err) {
      pending.task.error(this.clock.now(), err);
    }
  }
}

class RelativeScheduler implements Scheduler {
  declare private readonly offset: Offset;
  declare private readonly parent: Scheduler;

  constructor(offset: Offset, parent: Scheduler) {
    this.offset = offset;
    this.parent = parent;
  }

  currentTime(): Time {
    return toTime((this.parent.currentTime() as number) + (this.offset as number));
  }

  scheduleTask(delay: Duration, task: Task): ScheduledTask {
    return this.parent.scheduleTask(delay, task);
  }

  relative(offset: Offset): Scheduler {
    return new RelativeScheduler(
      toTime((this.offset as number) + (offset as number)) as unknown as Offset,
      this.parent,
    );
  }

  cancelTask(st: ScheduledTask): void {
    this.parent.cancelTask(st);
  }
}
