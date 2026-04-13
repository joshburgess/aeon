/**
 * DOM Behaviors — continuous time-varying values derived from the DOM.
 *
 * These create Behaviors that are push-updated from DOM events and
 * pull-sampled when read. Each returns [Behavior, Disposable] since
 * they subscribe to DOM events internally.
 */

import { stepper } from "aeon-core"
import { map } from "aeon-core"
import type { Behavior, Disposable, Scheduler } from "aeon-types"
import { fromDOMEvent } from "./events.js"

/** 2D point for mouse coordinates. */
export interface Point {
  readonly x: number
  readonly y: number
}

/** Dimensions for window size. */
export interface Size {
  readonly width: number
  readonly height: number
}

/**
 * A Behavior holding the current mouse position.
 *
 * Denotation: `t => { x: mouseX(t), y: mouseY(t) }`
 *
 * Push-updated from mousemove events on the given target (defaults to document).
 * Returns [Behavior, Disposable] — dispose to stop listening.
 */
export const mousePosition = (
  scheduler: Scheduler,
  target: EventTarget = document,
): [Behavior<Point, never>, Disposable] => {
  const moves = map(
    (e: MouseEvent) => ({ x: e.clientX, y: e.clientY }),
    fromDOMEvent("mousemove", target as Document),
  )
  return stepper({ x: 0, y: 0 }, moves, scheduler)
}

/**
 * A Behavior holding the current window dimensions.
 *
 * Denotation: `t => { width: innerWidth(t), height: innerHeight(t) }`
 *
 * Push-updated from resize events on window.
 * Returns [Behavior, Disposable] — dispose to stop listening.
 */
export const windowSize = (scheduler: Scheduler): [Behavior<Size, never>, Disposable] => {
  const initial: Size =
    typeof window !== "undefined"
      ? { width: window.innerWidth, height: window.innerHeight }
      : { width: 0, height: 0 }

  const resizes = map(
    () => ({ width: window.innerWidth, height: window.innerHeight }),
    fromDOMEvent("resize", window as unknown as Window),
  )
  return stepper(initial, resizes, scheduler)
}
