/**
 * VirtualScheduler — deterministic scheduler for testing.
 *
 * All task execution is synchronous. Time advances only when
 * explicitly told to via advance() / advanceTo() / flush().
 */

import {
  type Duration,
  type Offset,
  type ScheduledTask,
  type Scheduler,
  TIME_ZERO,
  type Task,
  type Time,
  timeAdd,
  toTime,
} from "@pulse/types";
import { VirtualClock } from "./clock.js";
import { BinaryHeap } from "./heap.js";
import type { HeapEntry } from "./heap.js";

interface PendingTask {
  readonly task: Task;
  readonly time: Time;
  cancelled: boolean;
  heapEntry: HeapEntry<PendingTask> | undefined;
}

export class VirtualScheduler implements Scheduler {
  private declare readonly clock: VirtualClock;
  private declare readonly heap: BinaryHeap<PendingTask>;

  constructor(initialTime: Time = TIME_ZERO) {
    this.clock = new VirtualClock(initialTime);
    this.heap = new BinaryHeap();
  }

  currentTime(): Time {
    return this.clock.now();
  }

  scheduleTask(delay: Duration, task: Task): ScheduledTask {
    const time = timeAdd(this.clock.now(), delay);
    const pending: PendingTask = {
      task,
      time,
      cancelled: false,
      heapEntry: undefined,
    };
    pending.heapEntry = this.heap.insert(pending, time as number);

    return {
      task,
      time,
      dispose() {
        if (!pending.cancelled) {
          pending.cancelled = true;
          if (pending.heapEntry) {
            // Mark as cancelled; removal from heap happens lazily
          }
        }
      },
    };
  }

  relative(offset: Offset): Scheduler {
    return new VirtualRelativeScheduler(offset, this);
  }

  cancelTask(st: ScheduledTask): void {
    st.dispose();
  }

  /** Advance time by a duration, executing all tasks that fall within range. */
  advance(duration: Duration): void {
    const target = timeAdd(this.clock.now(), duration);
    this.advanceTo(target);
  }

  /** Advance to an exact time, executing all tasks up to and including that time. */
  advanceTo(time: Time): void {
    while (this.heap.size > 0) {
      const next = this.heap.peek()!;
      if ((next.priority as number) > (time as number)) break;
      this.heap.extractMin();
      const pending = next.value;
      if (!pending.cancelled) {
        this.clock.setTime(pending.time);
        try {
          pending.task.run(pending.time);
        } catch (err) {
          pending.task.error(pending.time, err);
        }
      }
    }
    this.clock.setTime(time);
  }

  /** Execute all pending tasks regardless of time. */
  flush(): void {
    while (this.heap.size > 0) {
      const next = this.heap.extractMin()!;
      const pending = next.value;
      if (!pending.cancelled) {
        this.clock.setTime(pending.time);
        try {
          pending.task.run(pending.time);
        } catch (err) {
          pending.task.error(pending.time, err);
        }
      }
    }
  }

  /** Number of pending (non-cancelled) tasks. */
  get pendingCount(): number {
    return this.heap.size;
  }
}

class VirtualRelativeScheduler implements Scheduler {
  private declare readonly offset: Offset;
  private declare readonly parent: VirtualScheduler;

  constructor(offset: Offset, parent: VirtualScheduler) {
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
    return new VirtualRelativeScheduler(
      toTime((this.offset as number) + (offset as number)) as unknown as Offset,
      this.parent,
    );
  }

  cancelTask(st: ScheduledTask): void {
    this.parent.cancelTask(st);
  }
}
