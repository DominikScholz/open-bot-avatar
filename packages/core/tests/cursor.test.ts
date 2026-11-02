import { describe, expect, it } from 'vitest';
import { examples } from '../src/examples.ts';
import { BASE_PITCH, BASE_YAW, computePose } from '../src/motion.ts';
import { sceneFrame } from '../src/render.ts';
import { REST, followGaze, followStep, pointerGaze, type FollowState } from '../src/follow.ts';

const base = { seed: 7, time: 3.3, motion: 'idle' as const, reducedMotion: false };
const box = { left: 100, top: 100, width: 160, height: 160 };
const eyes = { x: 0.5, y: 0.4 };
/** Pointer offset from the eyes, CSS px. */
const at = (dx: number, dy: number) => ({ x: 180 + dx, y: 164 + dy });

/** Run the follow easing at a fixed frame rate, collecting the state after every frame. */
function run(from: FollowState, target: { x: number; y: number } | null, seconds: number, fps = 60, reduced = false) {
  let state = from;
  const states: FollowState[] = [];
  for (let i = 0; i < Math.round(seconds * fps); i++) {
    state = followStep(state, target, 1 / fps, reduced).state;
    states.push(state);
  }
  return states;
}

describe('pointer to look direction', () => {
  it('aims from the eyes, not the box center', () => {
    const level = pointerGaze(at(120, 0), box, eyes);
    expect(level.y).toBeCloseTo(0, 6);
    expect(level.x).toBeGreaterThan(0);
    // Measured from the box center the same pointer would read as looking up.
    expect(pointerGaze(at(120, 0), box).y).toBeLessThan(-0.05);
  });

  it('is symmetric, radial and bounded', () => {
    const r = pointerGaze(at(100, 0), box, eyes), l = pointerGaze(at(-100, 0), box, eyes);
    expect(r.x).toBeCloseTo(-l.x, 9);
    const d = pointerGaze(at(100 / Math.SQRT2, 100 / Math.SQRT2), box, eyes);
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(r.x, 9);
    const far = pointerGaze(at(5000, -5000), box, eyes);
    expect(Math.hypot(far.x, far.y)).toBeLessThanOrEqual(1);
    expect(pointerGaze(at(0, 0), box, eyes)).toEqual({ x: 0, y: 0 });
  });

  it('uses most of the range at the edge of a stage around the avatar', () => {
    expect(pointerGaze(at(200, 0), box, eyes).x).toBeGreaterThan(0.8);
    expect(pointerGaze(at(0, -90), box, eyes).y).toBeLessThan(-0.45);
  });
});

describe('body and eyes turn toward the pointer', () => {
  const look = (x: number, y: number) => computePose({ ...base, gaze: { x, y } });

  it('turns right/left and tips up/down with the matching sign, eyes the same way', () => {
    const c = look(0, 0), r = look(0.8, 0), l = look(-0.8, 0), u = look(0, -0.8), d = look(0, 0.8);
    expect(r.yaw).toBeGreaterThan(c.yaw);
    expect(l.yaw).toBeLessThan(c.yaw);
    expect(r.yaw - c.yaw).toBeCloseTo(c.yaw - l.yaw, 9);
    expect(r.gazeX).toBeGreaterThan(0);
    expect(l.gazeX).toBeLessThan(0);
    // Positive pitch tips the front up (CSS rotateX and the SVG projection agree).
    expect(u.pitch).toBeGreaterThan(c.pitch);
    expect(d.pitch).toBeLessThan(c.pitch);
    expect(u.gazeY).toBeLessThan(0);
    expect(d.gazeY).toBeGreaterThan(0);
  });

  it('a pointer on the face turns the body to face the viewer', () => {
    const still = computePose({ ...base, reducedMotion: true, gaze: { x: 0, y: 0 } });
    expect(still.yaw).toBe(BASE_YAW);
    const c = computePose({ ...base, time: 0, seed: 0, gaze: { x: 0, y: 0 } });
    expect(Math.abs(c.yaw)).toBeLessThan(Math.abs(BASE_YAW) / 3);
  });

  it('holds its aim instead of swaying through it', () => {
    const yaws = Array.from({ length: 80 }, (_, i) => computePose({ ...base, time: i * 0.1, gaze: { x: 0.6, y: 0 } }).yaw);
    const idle = Array.from({ length: 80 }, (_, i) => computePose({ ...base, time: i * 0.1 }).yaw);
    const spread = (a: number[]) => Math.max(...a) - Math.min(...a);
    expect(spread(yaws)).toBeLessThan(spread(idle) / 2);
  });

  it('weights the look: zero weight is the idle pose, small weights move a little', () => {
    const idle = computePose(base);
    expect(computePose({ ...base, gaze: { x: 1, y: -1, weight: 0 } })).toEqual(idle);
    const tiny = computePose({ ...base, gaze: { x: 1, y: -1, weight: 0.01 } });
    expect(Math.abs(tiny.yaw - idle.yaw)).toBeLessThan(0.01);
    expect(Math.abs(tiny.pitch - idle.pitch)).toBeLessThan(0.01);
  });

  it('keeps eye travel small and adds drag-to-turn on top', () => {
    const p = computePose({ ...base, gaze: { x: 1, y: 1 } });
    expect(Math.abs(p.gazeX)).toBeLessThanOrEqual(0.7);
    const turned = computePose({ ...base, gaze: { x: 1, y: 1 }, view: { yaw: 0.5, pitch: -0.2 } });
    expect(turned.yaw - p.yaw).toBeCloseTo(0.5, 9);
    expect(turned.pitch - p.pitch).toBeCloseTo(-0.2, 9);
  });

  it('under reduced motion only the eyes follow', () => {
    const p = computePose({ ...base, reducedMotion: true, gaze: { x: 1, y: -1 } });
    expect([p.yaw, p.pitch]).toEqual([BASE_YAW, BASE_PITCH]);
    expect(p.gazeX).toBe(1);
    expect(p.gazeY).toBe(-1);
  });
});

describe('follow easing', () => {
  const pose = (s: FollowState) => computePose({ ...base, gaze: followGaze(s) });
  const maxStep = (states: FollowState[], from: FollowState) => {
    let prev = pose(from), max = 0;
    for (const s of states) {
      const p = pose(s);
      max = Math.max(max, Math.hypot(p.yaw - prev.yaw, p.pitch - prev.pitch));
      prev = p;
    }
    return max;
  };
  const looking: FollowState = { x: 0.9, y: -0.4, attention: 1 };

  it('the pose reads attention as the look weight', () => {
    expect(followGaze(REST)).toBeUndefined();
    expect(followGaze({ x: 0.2, y: 0.1, attention: 0.5 })).toEqual({ x: 0.2, y: 0.1, weight: 0.5 });
    expect(followGaze({ x: 0.2, y: 0.1, attention: 1 })?.weight).toBe(1);
    expect(followGaze({ x: 0.2, y: 0.1, attention: 0.05 })?.weight).toBeLessThan(0.05);
  });

  it('returns to the resting turn without a jump when the pointer leaves', () => {
    const states = run(looking, null, 3);
    expect(states.at(-1)).toEqual(REST);
    // When attention did not reach the pose, the settle frame snapped ~0.3 rad back to rest.
    expect(maxStep(states, looking)).toBeLessThan(0.04);
    expect(pose(states.at(-1)!)).toEqual(computePose(base));
  });

  it('takes up a target without a jump', () => {
    const states = run(REST, { x: -0.9, y: 0.5 }, 3);
    expect(maxStep(states, REST)).toBeLessThan(0.04);
    expect(states.at(-1)).toEqual({ x: -0.9, y: 0.5, attention: 1 });
  });

  it('is independent of frame rate', () => {
    const a = run(REST, { x: 0.7, y: -0.3 }, 0.5, 30).at(-1)!;
    const b = run(REST, { x: 0.7, y: -0.3 }, 0.5, 144).at(-1)!;
    expect(a.x).toBeCloseTo(b.x, 2);
    expect(a.attention).toBeCloseTo(b.attention, 2);
  });

  it('snaps under reduced motion and reports when it has settled', () => {
    const step = followStep(REST, { x: 0.3, y: 0.2 }, 1 / 60, true);
    expect(step.state).toEqual({ x: 0.3, y: 0.2, attention: 1 });
    expect(followStep(step.state, { x: 0.3, y: 0.2 }, 1 / 60, false).moving).toBe(false);
    expect(followStep(step.state, null, 1 / 60, true)).toEqual({ state: REST, moving: false });
  });

  it('ignores long gaps between frames', () => {
    const next = followStep(REST, { x: 1, y: 0 }, 5, false).state;
    expect(next.x).toBeLessThan(0.6);
  });
});

describe('every starter keeps its eyes while following', () => {
  for (const def of examples) {
    it(def.id, () => {
      for (const [x, y] of [[1, 0], [-1, 0], [0, -1], [0, 1], [0.7, -0.7], [-0.7, 0.7]]) {
        for (const time of [0, 1.7, 4.1]) {
          const frame = sceneFrame(def, { time, gaze: { x, y } });
          expect(frame.stack).toBe('z');
          expect(frame.eyes.every((e) => e.visible)).toBe(true);
        }
      }
    });
  }
});
