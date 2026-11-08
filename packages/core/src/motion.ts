/**
 * Deterministic pose model. A pose is a pure function of (seed, time, motion,
 * gaze, reducedMotion): no wall clock, no Math.random, so any frame can be
 * reproduced exactly (tests, SSR, scrubbing).
 */
import type { AvatarMotion, AvatarMotionBlend } from './types.ts';

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
  /** `flat` is the bored, half-shut look: wide horizontal slits instead of tall pills. */
  eyeShape: 'pill' | 'happy' | 'flat';
  /** Turn of the face inside the head, in radians (see RenderOptions.faceTurn). */
  faceTurn: number;
  /** The body's turn about its own vertical axis, in depth, in radians (see RenderOptions.bodyTurn). */
  bodyTurn: number;
  /** The face's turn in the picture plane, about the body's centre, in radians (see RenderOptions.faceWhirl). */
  faceWhirl: number;
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

/** Faster, wider glances for a busy state: a new saccade target every ~0.55 s. */
function dartAt(seed: number, t: number): [number, number] {
  const SLOT = 0.55;
  const s = Math.floor(t / SLOT);
  const target = (k: number): [number, number] => {
    if (noise(seed, 2000 + k * 3) < 0.22) return [0, 0];
    return [(noise(seed, 2001 + k * 3) * 2 - 1) * 0.85, (noise(seed, 2002 + k * 3) * 2 - 1) * 0.55];
  };
  const a = target(s - 1), b = target(s);
  const e = smooth((t - s * SLOT) / 0.1);
  return [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e];
}

export interface PoseInput {
  seed: number;
  time: number;
  /** Seconds since `motion` began, for motions that settle (see `done`). */
  motionAge?: number;
  motion: AvatarMotion;
  /** Look target, -1..1 per axis (x right, y down); `weight` 0..1 fades it in over the idle pose (default 1). */
  gaze?: { x: number; y: number; weight?: number };
  reducedMotion: boolean;
  /** Extra view rotation in radians (e.g. from drag-to-turn), added to the resting view. */
  view?: { yaw: number; pitch: number };
  /** Easing in `motion` from the mood shown before (see blendPoses). */
  blend?: AvatarMotionBlend;
}

/**
 * Pose part way from `a` to `b`, both taken at the same moment so either
 * side's motion keeps running. A change of eye shape swaps halfway, inside a
 * blink: pills close toward the swap and open after it.
 */
export function blendPoses(a: Pose, b: Pose, t: number): Pose {
  const k = clamp(t, 0, 1);
  const mix = (x: number, y: number) => x + (y - x) * k;
  const pose: Pose = {
    yaw: mix(a.yaw, b.yaw), pitch: mix(a.pitch, b.pitch), roll: mix(a.roll, b.roll), lift: mix(a.lift, b.lift),
    sx: mix(a.sx, b.sx), sy: mix(a.sy, b.sy), gazeX: mix(a.gazeX, b.gazeX), gazeY: mix(a.gazeY, b.gazeY),
    blink: mix(a.blink, b.blink), squintL: mix(a.squintL, b.squintL), squintR: mix(a.squintR, b.squintR),
    eyeShape: b.eyeShape,
    faceTurn: mix(a.faceTurn, b.faceTurn),
    bodyTurn: mix(a.bodyTurn, b.bodyTurn),
    faceWhirl: mix(a.faceWhirl, b.faceWhirl),
  };
  if (a.eyeShape !== b.eyeShape) {
    pose.eyeShape = k < 0.5 ? a.eyeShape : b.eyeShape;
    pose.blink = Math.max(pose.blink, 1 - Math.abs(2 * k - 1));
  }
  return pose;
}

export function computePose(input: PoseInput): Pose {
  const pose = moodPose(input);
  const blend = input.blend;
  if (!blend || !(blend.t < 1)) return pose;
  const from = typeof blend.from === 'string' ? { motion: blend.from } : blend.from;
  return blendPoses(computePose({ ...input, motion: from.motion, blend: from.blend }), pose, Number.isFinite(blend.t) ? blend.t : 1);
}

function moodPose({ seed, time, motion, gaze, reducedMotion, view }: PoseInput): Pose {
  // Per-avatar phase offset so several avatars on a page do not move in lockstep.
  const t = reducedMotion ? 0 : time + noise(seed, 7) * 10;
  const wave = (period: number, phase = 0) => (reducedMotion ? 0 : Math.sin((TAU * t) / period + phase));
  const given = gaze && Number.isFinite(gaze.x) && Number.isFinite(gaze.y)
    ? [clamp(gaze.x, -1, 1), clamp(gaze.y, -1, 1)] as [number, number]
    : null;
  const weight = given ? (Number.isFinite(gaze?.weight) ? clamp(gaze?.weight as number, 0, 1) : 1) : 0;
  // While it attends to a target the body holds its aim: idle sway of the turn settles to a trace.
  const sway = 1 - 0.7 * weight;

  const pose: Pose = {
    yaw: BASE_YAW, pitch: BASE_PITCH, roll: 0, lift: 0, sx: 1, sy: 1,
    gazeX: 0, gazeY: 0, blink: 0, squintL: 0, squintR: 0, eyeShape: 'pill', faceTurn: 0, bodyTurn: 0, faceWhirl: 0,
  };

  if (motion === 'done') {
    // Content rather than triumphant: it keeps looking around while the paint dries.
    // `motionAge` is deliberately unused here, so a direct render matches the live one.
    const breath = wave(4.2, -Math.PI / 2);
    pose.yaw += 0.1 * sway * wave(5.2);
    pose.pitch += 0.035 * wave(4.6, 1);
    pose.roll = 3.2 * wave(4.9, 2);
    pose.lift = reducedMotion ? 0 : -0.55 * (1 - Math.cos((TAU * t) / 4.2));
    pose.sy = 1 + 0.012 * breath;
    pose.sx = 1 - 0.008 * breath;
    if (!reducedMotion) {
      pose.blink = blinkAt(seed, t * 1.1);
      [pose.gazeX, pose.gazeY] = wanderAt(seed, t * 1.35);
    }
  } else if (motion === 'happy') {
    const period = 0.92;
    const p = reducedMotion ? 0.5 : ((t % period) + period) % period / period;
    const air = 4 * p * (1 - p);
    const land = reducedMotion ? 0 : clamp(1 - Math.min(p, 1 - p) / 0.12, 0, 1);
    pose.lift = reducedMotion ? 0 : -3.2 * air;
    pose.sy = 1 - 0.09 * land + 0.03 * air * (reducedMotion ? 0 : 1);
    pose.sx = 1 + 0.07 * land - 0.015 * air * (reducedMotion ? 0 : 1);
    pose.roll = 4.5 * wave(period * 2);
    pose.yaw += 0.1 * wave(period * 2, 0.6);
    pose.eyeShape = 'happy';
  } else if (motion === 'working') {
    // Busy: the head holds a steady lean and works against it, breathing in and out
    // of step with the lean, while the eyes dart from one thing to the next and the
    // two lids narrow out of step, so it reads as scanning rather than staring.
    // Measured against the Grok Bot: lean ~4 deg, wobble ~0.5 deg every 0.65 s.
    const period = 0.655;
    const beat = wave(period);
    pose.yaw += 0.1 * wave(period * 3, 0.4);
    pose.pitch += 0.07;
    pose.roll = 4 + 0.54 * beat;
    pose.lift = reducedMotion ? 0 : -0.11 * (1 - Math.cos((TAU * t) / 4.9));
    pose.sx = 1;
    pose.sy = 0.993 - 0.0064 * beat;
    if (reducedMotion) {
      pose.gazeX = 0.12;
      pose.squintL = 0.26;
      pose.squintR = 0.26;
    } else {
      [pose.gazeX, pose.gazeY] = dartAt(seed, t);
      pose.squintL = 0.22 + 0.14 * wave(2.7);
      pose.squintR = 0.22 + 0.14 * wave(3.3, 1.7);
      pose.blink = blinkAt(seed, t * 1.35);
    }
  } else if (motion === 'waiting') {
    // Bored wait: the head leans on one side and the eyes flatten into horizontal slits,
    // glancing at whoever it is waiting on with the occasional slow blink.
    pose.yaw += 0.05 * sway * wave(7.4);
    pose.pitch += 0.03;
    pose.roll = 8.2 + 1.5 * wave(6.8, 2);
    pose.lift = reducedMotion ? 0 : -0.4 * (1 - Math.cos((TAU * t) / 6.2));
    pose.gazeX = 0.44 + 0.16 * wave(8.2);
    pose.gazeY = 0.08 + 0.07 * wave(5.6, 1);
    pose.eyeShape = 'flat';
    if (!reducedMotion) pose.blink = blinkAt(seed, t * 0.7);
  } else if (motion === 'blocked') {
    // Alert pulses and a small shake: something needs attention now.
    const pulse = reducedMotion ? 0 : Math.max(0, wave(1.6));
    pose.yaw += 0.04 * wave(3.2, 0.8);
    pose.roll = 2.6 * wave(1.6, 0.2);
    pose.lift = -1.4 * pulse;
    pose.sx = 1 + 0.04 * pulse;
    pose.sy = 1 - 0.03 * pulse;
    pose.gazeX = 0;
    pose.gazeY = 0;
    if (!reducedMotion) pose.blink = blinkAt(seed, t * 1.7);
  } else if (motion === 'thinking') {
    pose.yaw += 0.12 + 0.05 * sway * wave(7.3);
    pose.pitch += 0.08;
    pose.roll = -5 + 1.4 * wave(4.1);
    pose.lift = -0.5 * (1 - Math.cos((TAU * t) / 5.2)) * (reducedMotion ? 0 : 1);
    pose.gazeX = 0.55 + 0.3 * wave(5.6);
    pose.gazeY = -0.8;
    pose.squintL = 0.22;
    pose.squintR = 0.32 + 0.1 * wave(3.1);
    if (!reducedMotion) pose.blink = blinkAt(seed, t * 0.7);
  } else {
    pose.yaw += 0.07 * sway * wave(6.1);
    pose.pitch += 0.04 * sway * wave(4.7, 1);
    pose.roll = 1.6 * wave(5.3, 2);
    pose.lift = reducedMotion ? 0 : -0.45 * (1 - Math.cos((TAU * t) / 3.4));
    const breath = wave(3.4, -Math.PI / 2);
    pose.sy = 1 + 0.012 * breath;
    pose.sx = 1 - 0.008 * breath;
    if (!reducedMotion) {
      pose.blink = blinkAt(seed, t);
      [pose.gazeX, pose.gazeY] = wanderAt(seed, t);
    }
  }

  if (given && weight > 0) {
    // A look target wins over idle wander. The body turns to face it: the resting
    // three-quarter turn gives way (so a target on either side turns the front that
    // way) and the eyes add a modest share on top. Reduced motion keeps the body
    // still, so the eyes alone use their full (still small) range.
    const mix = (a: number, b: number) => a + (b - a) * weight;
    const share = reducedMotion ? 1 : LOOK_EYES;
    if (pose.eyeShape === 'pill') {
      pose.gazeX = mix(pose.gazeX, given[0] * share);
      pose.gazeY = mix(pose.gazeY, given[1] * share);
    }
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
