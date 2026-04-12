/**
 * Minimal synchronous test scheduler.
 *
 * This is an internal utility for testing aeon-core. The full
 * VirtualScheduler lives in aeon-test. This one just tracks
 * "current time" and executes tasks synchronously in order.
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
  timeShift,
  toTime,
} from "aeon-types";

interface PendingTask {
  readonly time: Time;
  readonly task: Task;
  cancelled: boolean;
}

export class TestScheduler implements Scheduler {
  private now: Time;
  private queue: PendingTask[];

  constructor() {
    this.now = TIME_ZERO;
    this.queue = [];
  }

  currentTime(): Time {
    return this.now;
  }

  scheduleTask(delay: Duration, task: Task): ScheduledTask {
    const time = timeAdd(this.now, delay);
    const pending: PendingTask = { time, task, cancelled: false };
    this.queue.push(pending);
    this.queue.sort((a, b) => (a.time as number) - (b.time as number));
    return {
      task,
      time,
      dispose() {
        pending.cancelled = true;
      },
    };
  }

  relative(offset: Offset): Scheduler {
    const shifted: Scheduler = {
      currentTime: () => timeShift(this.currentTime(), offset),
      scheduleTask: (delay, task) => this.scheduleTask(delay, task),
      relative: (o) => this.relative(o),
      cancelTask: (st) => this.cancelTask(st),
    };
    return shifted;
  }

  cancelTask(st: ScheduledTask): void {
    st.dispose();
  }

  /** Advance time to the given point, executing all tasks up to that time. */
  advanceTo(time: Time): void {
    while (this.queue.length > 0) {
      const next = this.queue[0]!;
      if ((next.time as number) > (time as number)) break;
      this.queue.shift();
      if (!next.cancelled) {
        this.now = next.time;
        next.task.run(next.time);
      }
    }
    this.now = time;
  }

  /** Run all pending tasks regardless of time. */
  flush(): void {
    const maxTime =
      this.queue.length > 0
        ? toTime(Math.max(...this.queue.map((t) => t.time as number)))
        : this.now;
    this.advanceTo(maxTime);
  }
}
