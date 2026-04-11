/**
 * Animation frame Event source.
 *
 * Emits a DOMHighResTimeStamp on each requestAnimationFrame callback.
 */

import type { Disposable, Event as PulseEvent, Scheduler, Sink, Source } from "@pulse/types";
import { createEvent } from "./internal.js";

class AnimationFrameSource implements Source<DOMHighResTimeStamp, never> {
  run(sink: Sink<DOMHighResTimeStamp, never>, scheduler: Scheduler): Disposable {
    let id = 0;
    let disposed = false;

    const tick = (timestamp: DOMHighResTimeStamp) => {
      if (disposed) return;
      sink.event(scheduler.currentTime(), timestamp);
      id = requestAnimationFrame(tick);
    };

    id = requestAnimationFrame(tick);

    return {
      dispose() {
        disposed = true;
        cancelAnimationFrame(id);
      },
    };
  }
}

const ANIMATION_FRAME_SOURCE = new AnimationFrameSource();

/**
 * An Event that emits a DOMHighResTimeStamp on each animation frame.
 *
 * Denotation: `[(t, timestamp) | each requestAnimationFrame callback]`
 *
 * Cancels the animation frame loop when disposed.
 */
export const animationFrames: PulseEvent<DOMHighResTimeStamp, never> =
  createEvent(ANIMATION_FRAME_SOURCE);
