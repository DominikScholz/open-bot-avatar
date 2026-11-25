/**
 * One shared animation loop for every live avatar on the page.
 *
 * Subscribers measure first and draw second, so layout reads never interleave
 * with DOM writes. The loop sleeps once no subscriber needs frames (every
 * avatar is still, or under reduced motion with its easing settled).
 * Subscribers that ask to wait are skipped until their time comes.
 */

export interface Pointer {
  x: number;
  y: number;
}

export interface FrameSubscriber {
  measure?: () => void;
  /**
   * `time` is the animation clock in seconds, `pointer` the last pointer
   * position in viewport pixels (null when there is none). Return true for
   * the next frame, a number of seconds to skip (neither measured nor drawn
   * until then), or false once no more frames are needed.
   */
  draw: (time: number, pointer: Pointer | null) => boolean | number;
}

const subscribers = new Set<FrameSubscriber>();
// Only mountAvatar opts into parking. Public subscribers keep their existing behavior:
// returning false need not schedule another tick, but they still join ticks requested by others.
const mayPark = new WeakMap<FrameSubscriber, () => boolean>();
const parked = new Set<FrameSubscriber>();
const ready: FrameSubscriber[] = [];
let frame = 0;
let visibilityBound = false;
/** Animation time before which a subscriber that asked to wait is skipped (neither measured nor drawn). */
const due = new WeakMap<FrameSubscriber, number>();
/** Tolerance (s) for VSync jitter so 60 Hz / 120 Hz don't slip by a frame while 144 Hz stays <= 60 fps. */
const DUE_TOLERANCE = 0.0015;
let pointer: Pointer | null = null;
const startedAt = typeof performance !== 'undefined' ? performance.now() : 0;
let lastTickNow = 0;
let highRefresh = false;

function isHidden(): boolean {
  return typeof document !== 'undefined' && document.hidden === true;
}

function onVisibilityChange() {
  if (isHidden()) {
    if (frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
    lastTickNow = 0;
  } else {
    requestFrame();
  }
}

function tick(now: number) {
  frame = 0;
  if (isHidden()) return;
  if (lastTickNow > 0) {
    const dt = now - lastTickNow;
    // Detect >= 110 Hz displays (e.g. 120/144/240 Hz) so 60–100 Hz displays are never halved.
    if (dt > 1 && dt < 100) highRefresh = dt < 9.5;
  }
  lastTickNow = now;
  const time = (now - startedAt) / 1000;
  let busy = false;
  ready.length = 0;
  for (const s of subscribers) {
    const at = due.get(s);
    if (at !== undefined && at - time > DUE_TOLERANCE) busy = true;
    else ready.push(s);
  }
  for (let i = 0; i < ready.length; i++) ready[i].measure?.();
  for (let i = 0; i < ready.length; i++) {
    const s = ready[i];
    const prevDue = due.get(s);
    const next = s.draw(time, pointer);
    if (typeof next === 'number') {
      // Carry the deadline forward so jitter does not accumulate and 144 Hz stays at 60 fps.
      const carried = prevDue !== undefined ? prevDue + next : time + next;
      due.set(s, carried > time + DUE_TOLERANCE ? carried : time + next);
    } else {
      due.delete(s);
      // A request made during draw already queued another frame; don't lose that invalidation.
      if (next === false && !frame && mayPark.get(s)?.() && subscribers.delete(s)) parked.add(s);
    }
    busy = next !== false || busy;
  }
  ready.length = 0;
  if (busy) wake();
  else lastTickNow = 0;
}

function wake() {
  if (!frame && subscribers.size > 0 && !isHidden() && typeof requestAnimationFrame !== 'undefined') frame = requestAnimationFrame(tick);
}

export function subscribeFrames(subscriber: FrameSubscriber): () => void {
  if (!visibilityBound && typeof document !== 'undefined') {
    visibilityBound = true;
    document.addEventListener('visibilitychange', onVisibilityChange);
    if (typeof window !== 'undefined') {
      // Moving a window between displays can change canvas resolution without resizing its host.
      let dpr = window.devicePixelRatio;
      window.addEventListener('resize', () => {
        if (dpr === window.devicePixelRatio) return;
        dpr = window.devicePixelRatio;
        if (parked.size) requestFrame();
      });
    }
  }
  subscribers.add(subscriber);
  wake();
  return () => {
    subscribers.delete(subscriber);
    parked.delete(subscriber);
    if (subscribers.size === 0) {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    }
  };
}

/** Internal: an unchanged mount can sit out other avatars' frames until an input changes. */
export function subscribeMountFrames(subscriber: FrameSubscriber, canPark: () => boolean) {
  mayPark.set(subscriber, canPark);
  const unsubscribe = subscribeFrames(subscriber);
  return {
    request() {
      if (parked.delete(subscriber)) subscribers.add(subscriber);
      wake();
    },
    unsubscribe,
  };
}

/** Set the pointer every following avatar looks toward (viewport pixels), or null when there is none. */
export function setPointer(next: Pointer | null) {
  pointer = next;
  wake();
}

/** True when the display refresh rate is >= 110 Hz (so 60 fps capping skips frames without halving 90/100 Hz). */
export function isHighRefresh(): boolean {
  return highRefresh;
}

/** Current pointer position, if any (internal helper so measure hooks can skip layout reads when idle). */
export function currentPointer(): Pointer | null {
  return pointer;
}

/** Request a frame after a non-animated change (color, depth, definition). */
export function requestFrame() {
  // Global invalidation: motion preference, restored WebGL context, or an explicit request.
  for (const s of parked) subscribers.add(s);
  parked.clear();
  wake();
}
