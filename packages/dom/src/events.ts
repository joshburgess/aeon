/**
 * DOM Event sources.
 *
 * Creates pulse Event streams from DOM EventTarget events.
 */

import type {
  Disposable,
  Event as PulseEvent,
  Scheduler,
  Sink,
  Source,
} from "@pulse/types";
import { createEvent } from "./internal.js";

class DOMEventSource<E extends Event> implements Source<E, never> {
  declare readonly type: string;
  declare readonly target: EventTarget;
  declare readonly options: AddEventListenerOptions | undefined;

  constructor(type: string, target: EventTarget, options?: AddEventListenerOptions) {
    this.type = type;
    this.target = target;
    this.options = options;
  }

  run(sink: Sink<E, never>, scheduler: Scheduler): Disposable {
    const handler = (e: Event) => {
      sink.event(scheduler.currentTime(), e as E);
    };
    this.target.addEventListener(this.type, handler, this.options);
    return {
      dispose: () => {
        this.target.removeEventListener(this.type, handler, this.options);
      },
    };
  }
}

/**
 * Create a pulse Event from a DOM event.
 *
 * Denotation: `[(t, domEvent) | domEvent fires on target at time t]`
 *
 * Automatically removes the event listener when disposed.
 */
export function fromDOMEvent<K extends keyof HTMLElementEventMap>(
  type: K,
  target: HTMLElement,
  options?: AddEventListenerOptions,
): PulseEvent<HTMLElementEventMap[K], never>;
export function fromDOMEvent<K extends keyof WindowEventMap>(
  type: K,
  target: Window,
  options?: AddEventListenerOptions,
): PulseEvent<WindowEventMap[K], never>;
export function fromDOMEvent<K extends keyof DocumentEventMap>(
  type: K,
  target: Document,
  options?: AddEventListenerOptions,
): PulseEvent<DocumentEventMap[K], never>;
export function fromDOMEvent(
  type: string,
  target: EventTarget,
  options?: AddEventListenerOptions,
): PulseEvent<Event, never>;
export function fromDOMEvent(
  type: string,
  target: EventTarget,
  options?: AddEventListenerOptions,
): PulseEvent<Event, never> {
  return createEvent(new DOMEventSource(type, target, options));
}
