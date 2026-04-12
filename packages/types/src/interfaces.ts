/**
 * Core runtime interfaces for the push/pull reactive system.
 *
 * These define the contracts that packages/core and packages/scheduler implement.
 * Denotational meanings are stated in JSDoc.
 */

import type { Duration, Offset, Time } from "./branded.js";

// --- Disposable ---

/** A handle to a resource that can be released. */
export interface Disposable {
  dispose(): void;
}

// --- Sink ---

/**
 * Consumer of events over time.
 *
 * Denotation: an observer that receives a time-indexed sequence of values,
 * a possible typed error, and a termination signal.
 */
export interface Sink<A, E = never> {
  /** Receive a value at a point in time. */
  event(time: Time, value: A): void;
  /** Receive an error at a point in time. */
  error(time: Time, err: E): void;
  /** Signal that no more events will arrive. */
  end(time: Time): void;
}

// --- Source ---

/**
 * Producer of events over time.
 *
 * Denotation: when run, produces a time-indexed sequence [(Time, A)]
 * that may terminate or error.
 */
export interface Source<A, E = never> {
  run(sink: Sink<A, E>, scheduler: Scheduler): Disposable;
}

// --- Task & ScheduledTask ---

/** A unit of work to be executed by the scheduler. */
export interface Task {
  run(time: Time): void;
  error(time: Time, err: unknown): void;
  dispose(): void;
}

/** A task that has been scheduled for future execution. */
export interface ScheduledTask extends Disposable {
  readonly task: Task;
  readonly time: Time;
}

// --- Scheduler ---

/**
 * Coordinates the execution of tasks over time.
 *
 * The scheduler is the single source of truth for "what time is it"
 * within a reactive pipeline.
 */
export interface Scheduler {
  /** The current time according to this scheduler. */
  currentTime(): Time;

  /** Schedule a task to run after a delay. */
  scheduleTask(delay: Duration, task: Task): ScheduledTask;

  /** Create a child scheduler whose time is shifted by an offset. */
  relative(offset: Offset): Scheduler;

  /** Cancel a previously scheduled task. */
  cancelTask(task: ScheduledTask): void;
}

// --- Opaque Event and Behavior types ---

declare const EventBrand: unique symbol;

/**
 * A discrete, time-indexed sequence of values.
 *
 * Denotation: `[(Time, A)]` — a list of time-value pairs, possibly
 * terminating with an error of type E.
 */
export type Event<A, E = never> = {
  readonly [EventBrand]: [A, E];
};

declare const BehaviorBrand: unique symbol;

/**
 * A continuous, time-varying value.
 *
 * Denotation: `Time -> A` — a function from time to a value,
 * possibly failing with an error of type E.
 */
export type Behavior<A, E = never> = {
  readonly [BehaviorBrand]: [A, E];
};

