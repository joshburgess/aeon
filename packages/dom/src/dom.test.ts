import { VirtualScheduler } from "@pulse/scheduler";
import type { Disposable, Sink, Source, Time } from "@pulse/types";
import { describe, expect, it } from "vitest";
import { fromDOMEvent } from "./events.js";

// Minimal mock EventTarget for testing without a real DOM
class MockEventTarget implements EventTarget {
  private listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();

  addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    _options?: AddEventListenerOptions | boolean,
  ): void {
    if (!callback) return;
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(callback);
  }

  removeEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    _options?: EventListenerOptions | boolean,
  ): void {
    if (!callback) return;
    this.listeners.get(type)?.delete(callback);
  }

  dispatchEvent(event: Event): boolean {
    const listeners = this.listeners.get(event.type);
    if (listeners) {
      for (const listener of listeners) {
        if (typeof listener === "function") {
          listener(event);
        } else {
          listener.handleEvent(event);
        }
      }
    }
    return true;
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }
}

/** Helper: get the Source from a pulse Event (Event IS Source at runtime). */
const getSource = <A, E>(event: unknown): Source<A, E> => event as Source<A, E>;

describe("fromDOMEvent", () => {
  it("emits DOM events as pulse events", () => {
    const scheduler = new VirtualScheduler();
    const target = new MockEventTarget();
    const stream = fromDOMEvent("click", target as unknown as HTMLElement);

    const values: Event[] = [];
    getSource<Event, never>(stream).run(
      {
        event(_t: Time, v: Event) {
          values.push(v);
        },
        error() {},
        end() {},
      },
      scheduler,
    );

    const clickEvent = new Event("click");
    target.dispatchEvent(clickEvent);
    expect(values).toHaveLength(1);
    expect(values[0]).toBe(clickEvent);
  });

  it("removes listener on dispose", () => {
    const scheduler = new VirtualScheduler();
    const target = new MockEventTarget();
    const stream = fromDOMEvent("click", target as unknown as HTMLElement);

    const disposable = getSource<Event, never>(stream).run(
      {
        event() {},
        error() {},
        end() {},
      },
      scheduler,
    );

    expect(target.listenerCount("click")).toBe(1);
    disposable.dispose();
    expect(target.listenerCount("click")).toBe(0);
  });

  it("does not emit after dispose", () => {
    const scheduler = new VirtualScheduler();
    const target = new MockEventTarget();
    const stream = fromDOMEvent("click", target as unknown as HTMLElement);

    const values: Event[] = [];
    const disposable = getSource<Event, never>(stream).run(
      {
        event(_t: Time, v: Event) {
          values.push(v);
        },
        error() {},
        end() {},
      },
      scheduler,
    );

    target.dispatchEvent(new Event("click"));
    expect(values).toHaveLength(1);

    disposable.dispose();
    target.dispatchEvent(new Event("click"));
    expect(values).toHaveLength(1);
  });

  it("supports multiple subscribers", () => {
    const scheduler = new VirtualScheduler();
    const target = new MockEventTarget();
    const stream = fromDOMEvent("click", target as unknown as HTMLElement);

    const values1: Event[] = [];
    const values2: Event[] = [];
    const source = getSource<Event, never>(stream);

    const d1 = source.run(
      {
        event(_t: Time, v: Event) {
          values1.push(v);
        },
        error() {},
        end() {},
      },
      scheduler,
    );
    const d2 = source.run(
      {
        event(_t: Time, v: Event) {
          values2.push(v);
        },
        error() {},
        end() {},
      },
      scheduler,
    );

    target.dispatchEvent(new Event("click"));
    expect(values1).toHaveLength(1);
    expect(values2).toHaveLength(1);

    d1.dispose();
    target.dispatchEvent(new Event("click"));
    expect(values1).toHaveLength(1);
    expect(values2).toHaveLength(2);

    d2.dispose();
  });
});
