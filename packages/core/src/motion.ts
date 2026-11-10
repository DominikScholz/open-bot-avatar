/**
 * Deterministic pose model. A pose is a pure function of (seed, time, state,
 * mood, gaze, reducedMotion): no wall clock, no Math.random, so any frame can
 * be reproduced exactly (tests, SSR, scrubbing).
 */
import type { AvatarMood, AvatarMotion, AvatarMotionBlend, AvatarState } from './types.ts';

/**
 * How the eyes are drawn, as numbers that blend: any two looks mix into a shape in between, so
 * the eyes morph from one to the other (see eyes.ts).
 */
export interface EyeLook {
  /** 0 = the plain pill, 1 = the happy arc. */
  arc: number;
  /** Top lid lowered by this share of the eye's height. */
  lid: number;
  /** Slope of the lid, -1..1: positive lowers its outer end (sad), negative its inner end (angry). */
  slant: number;
  /** 0..1 of the free room around the eye it opens into (surprised). */
  wide: number;
}

export interface Pose {
  /** View rotation in radians: yaw turns about the vertical axis, pitch about the horizontal. */
  yaw: number;
  pitch: number;
  /** In-plane rotation, degrees. */
  roll: number;
  /** Vertical offset (negative = up), viewBox units. */
  lift: number;
  /** Squash and stretch about the base of the body. */
  sx: number;
  sy: number;
  /** Eye look direction, -1..1 per axis. */
  gazeX: number;
  gazeY: number;
  /** 0 = open, 1 = fully closed. */
  blink: number;
  /** Extra lid narrowing per eye, 0..1. */
  squintL: number;
  squintR: number;
  eyes: EyeLook;
  /** Presence of the ribbons that circle the body, 0..1. */
  ribbons: number;
  /** How far the body has given way to a mark, 0..1 each: the exclamation mark and the three dots. */
  bang: number;
  dots: number;
}

/** Every state and mood, in the order hosts list them. */
export const STATES: readonly AvatarState[] = ['idle', 'thinking', 'working', 'waiting', 'blocked', 'done'];
export const MOODS: readonly AvatarMood[] = ['neutral', 'happy', 'surprised', 'angry', 'sad'];

export function isState(value: unknown): value is AvatarState {
  return STATES.includes(value as AvatarState);
}

export function isMood(value: unknown): value is AvatarMood {
  return MOODS.includes(value as AvatarMood);
}

/**
 * The state and mood to show. `motion` is the single option that came before them: `thinking`
 * is a state, `happy` a mood. An explicit `state` or `mood` wins over it.
 */
export function resolveLook(given: { state?: unknown; mood?: unknown; motion?: unknown }): { state: AvatarState; mood: AvatarMood } {
  return {
    state: isState(given.state) ? given.state : given.motion === 'thinking' ? 'thinking' : 'idle',
    mood: isMood(given.mood) ? given.mood : given.motion === 'happy' ? 'happy' : 'neutral',
  };
}

/** Resting view: turned a little and seen a little from above, so the volume reads without dominating. */
export const BASE_YAW = -0.3;
export const BASE_PITCH = 0.2;
/**
 * Following a look target: the body turns toward it by up to these angles
 * (radians, at full deflection) and the eyes use this share of their small
 * range, so the whole character looks rather than the eyes sliding alone.
 */
export const LOOK_YAW = 0.32;
export const LOOK_PITCH = 0.18;
export const LOOK_EYES = 0.7;

const TAU = Math.PI * 2;

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Stateless hash noise in [0, 1). */
export function noise(seed: number, n: number): number {
  let h = (seed ^ Math.imul(n | 0, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smooth = (u: number) => { const x = clamp(u, 0, 1); return x * x * (3 - 2 * x); };
const mix = (a: number, b: number, k: number) => a + (b - a) * k;

/** Blink closure 0..1: one blink per ~4.2 s slot at a seeded offset, sometimes a double blink. */
export function blinkAt(seed: number, t: number): number {
  const SLOT = 4.2, DUR = 0.19;
  const slot = Math.floor(t / SLOT);
  let closure = 0;
  for (const s of [slot - 1, slot]) {
    const start = s * SLOT + 0.5 + noise(seed, s * 2) * 2.9;
    const starts = noise(seed, s * 2 + 1) > 0.8 ? [start, start + 0.34] : [start];
    for (const b of starts) {
      const u = (t - b) / DUR;
      if (u > 0 && u < 1) closure = Math.max(closure, Math.sin(Math.PI * u));
    }
  }
  return closure;
}

/** Idle eye wander: short holds between quick saccades, centered more often than not. */
export function wanderAt(seed: number, t: number): [number, number] {
  const SLOT = 1.9;
  const s = Math.floor(t / SLOT);
  const target = (k: number): [number, number] => {
    if (noise(seed, 1000 + k * 3) < 0.4) return [0, 0];
    return [(noise(seed, 1001 + k * 3) * 2 - 1) * 0.6, (noise(seed, 1002 + k * 3) * 2 - 1) * 0.35];
  };
  const a = target(s - 1), b = target(s);
  const e = smooth((t - s * SLOT) / 0.16);
  return [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e];
}

/** Working: the eyes dart from one thing to the next, mostly down at the work. */
function dartAt(seed: number, t: number): [number, number] {
  const SLOT = 0.62;
  const s = Math.floor(t / SLOT);
  const target = (k: number): [number, number] => [(noise(seed, 2001 + k * 3) * 2 - 1) * 0.8, 0.1 + noise(seed, 2002 + k * 3) * 0.5];
  const a = target(s - 1), b = target(s);
  const e = smooth((t - s * SLOT) / 0.12);
  return [mix(a[0], b[0], e), mix(a[1], b[1], e)];
}

export interface PoseInput {
  seed: number;
  time: number;
  state?: AvatarState;
  mood?: AvatarMood;
  /** @deprecated Use `state` and `mood`; they win when given. */
  motion?: AvatarMotion;
  /** Seconds since `state` began; `done` turns once as it begins. Without it the state is settled. */
  stateAge?: number;
  /** Look target, -1..1 per axis (x right, y down); `weight` 0..1 fades it in over the idle pose (default 1). */
  gaze?: { x: number; y: number; weight?: number };
  reducedMotion: boolean;
  /** Extra view rotation in radians (e.g. from drag-to-turn), added to the resting view. */
  view?: { yaw: number; pitch: number };
  /** Easing in from what was shown before (see blendPoses). */
  blend?: AvatarMotionBlend;
}

/**
 * Pose part way from `a` to `b`, both taken at the same moment so either side's motion keeps
 * running. Everything is a number, the eyes' look included, so eyes morph from one shape to the
 * next and a body gives way to a mark (and back) part by part.
 */
export function blendPoses(a: Pose, b: Pose, t: number): Pose {
  const k = clamp(t, 0, 1);
  const m = (x: number, y: number) => mix(x, y, k);
  return {
    yaw: m(a.yaw, b.yaw), pitch: m(a.pitch, b.pitch), roll: m(a.roll, b.roll), lift: m(a.lift, b.lift),
    sx: m(a.sx, b.sx), sy: m(a.sy, b.sy), gazeX: m(a.gazeX, b.gazeX), gazeY: m(a.gazeY, b.gazeY),
    blink: m(a.blink, b.blink), squintL: m(a.squintL, b.squintL), squintR: m(a.squintR, b.squintR),
    eyes: { arc: m(a.eyes.arc, b.eyes.arc), lid: m(a.eyes.lid, b.eyes.lid), slant: m(a.eyes.slant, b.eyes.slant), wide: m(a.eyes.wide, b.eyes.wide) },
    ribbons: m(a.ribbons, b.ribbons), bang: m(a.bang, b.bang), dots: m(a.dots, b.dots),
  };
}

export function computePose(input: PoseInput): Pose {
  const pose = statePose(input);
  const blend = input.blend;
  if (!blend || !(blend.t < 1)) return pose;
  const from = typeof blend.from === 'string' ? { motion: blend.from } : blend.from;
  const before = computePose({ ...input, state: from.state, mood: from.mood, motion: from.motion, stateAge: from.age, blend: from.blend });
  return blendPoses(before, pose, Number.isFinite(blend.t) ? blend.t : 1);
}

/** Seconds `done` takes to turn once before it settles. */
export const DONE_TURN_S = 1.3;

/** What each mood does to the eyes. A happy bot's arcs are the whole eye, so lids do not apply to them. */
const MOOD_EYES: Record<AvatarMood, EyeLook> = {
  neutral: { arc: 0, lid: 0, slant: 0, wide: 0 },
  happy: { arc: 1, lid: 0, slant: 0, wide: 0 },
  surprised: { arc: 0, lid: 0, slant: 0, wide: 1 },
  angry: { arc: 0, lid: 0.2, slant: -1, wide: 0 },
  sad: { arc: 0, lid: 0.2, slant: 1, wide: 0 },
};

function statePose(input: PoseInput): Pose {
  const { seed, time, gaze, reducedMotion, view } = input;
  const { state, mood } = resolveLook(input);
  // Per-avatar phase offset so several avatars on a page do not move in lockstep.
  const t = reducedMotion ? 0 : time + noise(seed, 7) * 10;
  const live = reducedMotion ? 0 : 1;
  const wave = (period: number, phase = 0) => (reducedMotion ? 0 : Math.sin((TAU * t) / period + phase));
  const given = gaze && Number.isFinite(gaze.x) && Number.isFinite(gaze.y)
    ? [clamp(gaze.x, -1, 1), clamp(gaze.y, -1, 1)] as [number, number]
    : null;
  const weight = given ? (Number.isFinite(gaze?.weight) ? clamp(gaze?.weight as number, 0, 1) : 1) : 0;
  // While it attends to a target the body holds its aim: idle sway of the turn settles to a trace.
  const sway = 1 - 0.7 * weight;

  const pose: Pose = {
    yaw: BASE_YAW, pitch: BASE_PITCH, roll: 0, lift: 0, sx: 1, sy: 1,
    gazeX: 0, gazeY: 0, blink: 0, squintL: 0, squintR: 0,
    eyes: { ...MOOD_EYES[mood] }, ribbons: 0, bang: 0, dots: 0,
  };
  /** The calm pose of a bot with nothing to do: it breathes, sways, blinks and looks around. */
  const rest = (pace: number) => {
    pose.yaw += 0.07 * sway * wave(6.1 * pace);
    pose.pitch += 0.04 * sway * wave(4.7 * pace, 1);
    pose.roll = 1.6 * wave(5.3 * pace, 2);
    pose.lift = reducedMotion ? 0 : -0.45 * (1 - Math.cos((TAU * t) / (3.4 * pace)));
    const breath = wave(3.4 * pace, -Math.PI / 2);
    pose.sy = 1 + 0.012 * breath;
    pose.sx = 1 - 0.008 * breath;
    if (!reducedMotion) {
      pose.blink = blinkAt(seed, t);
      [pose.gazeX, pose.gazeY] = wanderAt(seed, t);
    }
  };

  if (state === 'idle' && mood === 'happy') {
    // With nothing to do, a happy bot hops.
    const period = 0.92;
    const p = reducedMotion ? 0.5 : ((t % period) + period) % period / period;
    const air = 4 * p * (1 - p);
    const land = reducedMotion ? 0 : clamp(1 - Math.min(p, 1 - p) / 0.12, 0, 1);
    pose.lift = reducedMotion ? 0 : -3.2 * air;
    pose.sy = 1 - 0.09 * land + 0.03 * air * live;
    pose.sx = 1 + 0.07 * land - 0.015 * air * live;
    pose.roll = 4.5 * wave(period * 2);
    pose.yaw += 0.1 * wave(period * 2, 0.6);
  } else if (state === 'thinking') {
    // Looks up and away while it gives way to the three dots.
    pose.yaw += 0.12 + 0.05 * sway * wave(7.3);
    pose.pitch += 0.08;
    pose.roll = -5 + 1.4 * wave(4.1);
    pose.lift = -0.5 * (1 - Math.cos((TAU * t) / 5.2)) * live;
    pose.gazeX = 0.55 + 0.3 * wave(5.6);
    pose.gazeY = -0.8;
    pose.squintL = 0.22;
    pose.squintR = 0.32 + 0.1 * wave(3.1);
    if (!reducedMotion) pose.blink = blinkAt(seed, t * 0.7);
    pose.dots = 1;
  } else if (state === 'working') {
    // Bent over the work and busy: a quick steady bob, eyes darting across it, ribbons circling.
    const beat = wave(0.7);
    pose.yaw += 0.08 * sway * wave(2.3, 0.4);
    pose.pitch -= 0.05;
    pose.roll = 3 + 0.6 * beat;
    pose.lift = -0.3 * (0.5 + 0.5 * beat) * live;
    pose.sy = 0.99 - 0.008 * beat;
    pose.sx = 1.005 + 0.005 * beat;
    pose.squintL = 0.25;
    pose.squintR = 0.25;
    if (reducedMotion) {
      pose.gazeX = 0.15;
      pose.gazeY = 0.3;
    } else {
      [pose.gazeX, pose.gazeY] = dartAt(seed, t);
      pose.blink = blinkAt(seed, t * 1.3);
    }
    pose.ribbons = live;
  } else if (state === 'waiting') {
    // Leans to one side with its lids half down, glancing off at whatever it is waiting on.
    // Now and then it sighs.
    const p = reducedMotion ? 0 : ((t % 6.5) + 6.5) % 6.5 / 6.5;
    // One breath in and out over the first third of the cycle.
    const sigh = Math.sin(TAU * clamp(p / 0.33, 0, 1));
    pose.yaw += 0.04 * sway * wave(7.4);
    pose.pitch += 0.02 + 0.03 * sigh;
    pose.roll = 7 + 1.2 * wave(6.4, 2);
    pose.lift = -0.3 * (1 - Math.cos((TAU * t) / 6.5)) * live;
    pose.sy = 1 + 0.025 * sigh;
    pose.sx = 1 - 0.012 * sigh;
    pose.gazeX = 0.5 + 0.15 * wave(8.2);
    pose.gazeY = 0.1;
    pose.eyes.lid += 0.42;
    if (!reducedMotion) pose.blink = blinkAt(seed, t * 0.6);
  } else if (state === 'blocked') {
    // Stops still while it gives way to the exclamation mark.
    pose.sy = 1.02;
    pose.sx = 0.99;
    pose.bang = 1;
  } else if (state === 'done') {
    // Turns once as it finishes, ribbons flying, then settles: content, and a little slower than idle.
    rest(1.25);
    const age = reducedMotion || !Number.isFinite(input.stateAge) ? Infinity : Math.max(0, input.stateAge as number);
    if (age < DONE_TURN_S) {
      const u = age / DONE_TURN_S;
      const swell = Math.sin(Math.PI * u);
      // Past the half turn the angle counts down to zero, so a change mid-turn finishes it the short way.
      const turn = TAU * smooth(u);
      pose.yaw += turn > Math.PI ? turn - TAU : turn;
      pose.lift -= 2.4 * swell;
      pose.sy += 0.04 * swell;
      pose.ribbons = Math.sqrt(swell);
    }
  } else {
    rest(1);
  }
  pose.eyes.lid = clamp(pose.eyes.lid, 0, 0.7);

  if (given && weight > 0) {
    // A look target wins over idle wander. The body turns to face it: the resting
    // three-quarter turn gives way (so a target on either side turns the front that
    // way) and the eyes add a modest share on top. Reduced motion keeps the body
    // still, so the eyes alone use their full (still small) range. Happy arcs stay put.
    const share = reducedMotion ? 1 : LOOK_EYES;
    const follow = weight * (1 - pose.eyes.arc);
    pose.gazeX = mix(pose.gazeX, given[0] * share, follow);
    pose.gazeY = mix(pose.gazeY, given[1] * share, follow);
    if (!reducedMotion) {
      // Positive yaw turns the front to the right, positive pitch tips it up.
      pose.yaw += weight * (given[0] * LOOK_YAW - BASE_YAW);
      pose.pitch += weight * (-given[1] * LOOK_PITCH - BASE_PITCH / 2);
    }
  }
  if (view && Number.isFinite(view.yaw) && Number.isFinite(view.pitch)) {
    pose.yaw += view.yaw;
    pose.pitch += view.pitch;
  }
  return pose;
}
