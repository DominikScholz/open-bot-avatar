/**
 * One shared animation loop for every live avatar on the page.
 *
 * Subscribers measure first and draw second, so layout reads never interleave
 * with DOM writes. The loop sleeps once no subscriber needs frames (every
 * avatar is still, or under reduced motion with its easing settled).
 */

export interface Pointer {
  x: number;
  y: number;
}

export interface FrameSubscriber {
  measure?: () => void;
  /**
   * `time` is the animation clock in seconds, `pointer` the last pointer
   * position in viewport pixels (null when there is none). Return true while
   * the subscriber still needs frames.
   */
  draw: (time: number, pointer: Pointer | null) => boolean;
}

const subscribers = new Set<FrameSubscriber>();
let frame = 0;
let pointer: Pointer | null = null;
const startedAt = typeof performance !== 'undefined' ? performance.now() : 0;

function tick(now: number) {
  frame = 0;
  const time = (now - startedAt) / 1000;
  for (const s of subscribers) s.measure?.();
  let busy = false;
  for (const s of subscribers) busy = s.draw(time, pointer) || busy;
  if (busy) wake();
}

function wake() {
  if (!frame && subscribers.size > 0 && typeof requestAnimationFrame !== 'undefined') frame = requestAnimationFrame(tick);
}

export function subscribeFrames(subscriber: FrameSubscriber): () => void {
  subscribers.add(subscriber);
  wake();
  return () => {
    subscribers.delete(subscriber);
    if (subscribers.size === 0 && frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  };
}

/** Set the pointer every following avatar looks toward (viewport pixels), or null when there is none. */
export function setPointer(next: Pointer | null) {
  pointer = next;
  wake();
}

/** Request a frame after a non-animated change (color, depth, definition). */
export function requestFrame() {
  wake();
}
