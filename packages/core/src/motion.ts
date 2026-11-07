/**
 * Deterministic pose model. A pose is a pure function of (seed, time, motion,
 * gaze, reducedMotion): no wall clock, no Math.random, so any frame can be
 * reproduced exactly (tests, SSR, scrubbing).
 */
import { eye, mixEyes, tameEye, type EyeParams } from './face.ts';
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
  /** Shape of the left and right eye. */
  eyes: [EyeParams, EyeParams];
  /** Both eyes moved across the face, -1..1 of FACE_TRAVEL per axis (x right, y down). */
  faceX: number;
  faceY: number;
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

/** Every mood, in the order hosts list them. */
export const MOTIONS: readonly AvatarMotion[] = [
  'idle', 'thinking', 'happy', 'excited', 'celebrate', 'determined', 'surprised', 'angry', 'sad', 'sleepy',
];

export function isMotion(value: unknown): value is AvatarMotion {
  return MOTIONS.includes(value as AvatarMotion);
}

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

export interface PoseInput {
  seed: number;
  time: number;
  motion: AvatarMotion;
  /** Look target, -1..1 per axis (x right, y down); `weight` 0..1 fades it in over the idle pose (default 1). */
  gaze?: { x: number; y: number; weight?: number };
  reducedMotion: boolean;
  /** Extra view rotation in radians (e.g. from drag-to-turn), added to the resting view. */
  view?: { yaw: number; pitch: number };
  /** Easing in `motion` from the mood shown before (see blendPoses). */
  blend?: AvatarMotionBlend;
  /**
   * How much of each mood's expression the avatar has room for, 0..1 (default 1): eye growth,
   * tilt and face travel scale down so tight silhouettes keep their eyes inside (see render.ts).
   */
  fit?: (motion: AvatarMotion) => number;
}

/**
 * Pose part way from `a` to `b`, both taken at the same moment so either
 * side's motion keeps running. Eye shapes morph from one to the other.
 */
export function blendPoses(a: Pose, b: Pose, t: number): Pose {
  const k = clamp(t, 0, 1);
  const mix = (x: number, y: number) => x + (y - x) * k;
  return {
    yaw: mix(a.yaw, b.yaw), pitch: mix(a.pitch, b.pitch), roll: mix(a.roll, b.roll), lift: mix(a.lift, b.lift),
    sx: mix(a.sx, b.sx), sy: mix(a.sy, b.sy), gazeX: mix(a.gazeX, b.gazeX), gazeY: mix(a.gazeY, b.gazeY),
    blink: mix(a.blink, b.blink), eyes: [mixEyes(a.eyes[0], b.eyes[0], k), mixEyes(a.eyes[1], b.eyes[1], k)],
    faceX: mix(a.faceX, b.faceX), faceY: mix(a.faceY, b.faceY),
  };
}

export function computePose(input: PoseInput): Pose {
  const pose = moodPose(input);
  const blend = input.blend;
  if (!blend || !(blend.t < 1)) return pose;
  const from = typeof blend.from === 'string' ? { motion: blend.from } : blend.from;
  return blendPoses(computePose({ ...input, motion: from.motion, blend: from.blend }), pose, Number.isFinite(blend.t) ? blend.t : 1);
}

const both = (o: Partial<EyeParams> = {}): [EyeParams, EyeParams] => [eye(o), eye(o)];
/** Position 0..1 within a repeating cycle. */
const cycle = (t: number, period: number) => (((t % period) + period) % period) / period;

function moodPose({ seed, time, motion, gaze, reducedMotion, view, fit }: PoseInput): Pose {
  // Per-avatar phase offset so several avatars on a page do not move in lockstep.
  const t = reducedMotion ? 0 : time + noise(seed, 7) * 10;
  const live = reducedMotion ? 0 : 1;
  const wave = (period: number, phase = 0) => (reducedMotion ? 0 : Math.sin((TAU * t) / period + phase));
  const at = (period: number, still: number) => (reducedMotion ? still : cycle(t, period));
  const blinks = (rate = 1) => (reducedMotion ? 0 : blinkAt(seed, t * rate));
  const given = gaze && Number.isFinite(gaze.x) && Number.isFinite(gaze.y)
    ? [clamp(gaze.x, -1, 1), clamp(gaze.y, -1, 1)] as [number, number]
    : null;
  const weight = given ? (Number.isFinite(gaze?.weight) ? clamp(gaze?.weight as number, 0, 1) : 1) : 0;
  // While it attends to a target the body holds its aim: idle sway of the turn settles to a trace.
  const sway = 1 - 0.7 * weight;

  const pose: Pose = {
    yaw: BASE_YAW, pitch: BASE_PITCH, roll: 0, lift: 0, sx: 1, sy: 1,
    gazeX: 0, gazeY: 0, blink: 0, eyes: both(), faceX: 0, faceY: 0,
  };
  const hop = (period: number, height: number, squash: number) => {
    const p = at(period, 0.5);
    const air = 4 * p * (1 - p);
    const land = reducedMotion ? 0 : clamp(1 - Math.min(p, 1 - p) / 0.12, 0, 1);
    pose.lift = -height * air * live;
    pose.sy = 1 - squash * land + squash * 0.33 * air * live;
    pose.sx = 1 + squash * 0.8 * land - squash * 0.17 * air * live;
  };
  const breathe = (period: number, amount: number) => {
    const b = wave(period, -Math.PI / 2);
    pose.sy *= 1 + amount * b;
    pose.sx *= 1 - amount * 0.65 * b;
  };

  switch (motion) {
    case 'happy': {
      hop(0.92, 3.2, 0.09);
      pose.roll = 4.5 * wave(1.84);
      pose.yaw += 0.1 * wave(1.84, 0.6);
      pose.eyes = both({ w: 2, h: 0.6, arch: 0.6 });
      pose.faceY = -0.25;
      break;
    }
    case 'excited': {
      // Rapid hops and wiggles, eyes big and raised.
      hop(0.5, 2.6, 0.08);
      pose.roll = 6 * wave(1);
      pose.yaw += 0.16 * wave(1, 0.8);
      const pulse = 0.05 * wave(0.5);
      pose.eyes = both({ w: 1.3 + pulse, h: 1.12 + pulse });
      pose.faceY = -0.5;
      break;
    }
    case 'celebrate': {
      // A full spin, then a couple of happy hops.
      const p = at(2.8, 0.7);
      const spin = p < 0.4 ? smooth(p / 0.4) : 1;
      pose.yaw += TAU * spin * live;
      if (p >= 0.4) {
        const q = (p - 0.4) / 0.6, hops = q * 2 - Math.floor(q * 2);
        pose.lift = -3 * 4 * hops * (1 - hops) * live;
        pose.sy = 1 + 0.04 * 4 * hops * (1 - hops) * live;
      } else {
        pose.lift = -1.5 * Math.sin(Math.PI * (p / 0.4)) * live;
      }
      pose.roll = 3 * wave(1.4);
      pose.eyes = both({ w: 2, h: 0.6, arch: 0.6 });
      pose.faceY = -0.3;
      break;
    }
    case 'determined': {
      // Leans in, steady and locked straight ahead; level eyes with the top lids lowered flat.
      // Every few seconds a slow nod of resolve, the lids settling a little lower with it.
      const p = at(3.4, 0);
      const nod = p < 0.4 ? Math.sin(Math.PI * p / 0.4) : 0;
      pose.pitch -= 0.08 + 0.06 * nod;
      pose.yaw += 0.02 * sway * wave(7.7);
      pose.sx = 1.02;
      pose.sy = 0.98 - 0.015 * nod;
      breathe(3.4, 0.008);
      pose.eyes = both({ w: 1.2, h: 0.78, lid: 0.32 + 0.08 * nod, tilt: 0.06 });
      pose.faceY = 0.1;
      pose.blink = blinks(0.6);
      break;
    }
    case 'surprised': {
      // Startled upright and grown tall, then held still: the eyes do the work, slowly opening
      // wider and then a quick double blink, a double take.
      const p = at(3.6, 0.3);
      const open = 0.5 - 0.5 * Math.cos(TAU * Math.min(p / 0.7, 1));
      const blinkAround = (c: number) => Math.max(0, Math.sin(Math.PI * clamp((p - c) / 0.06, 0, 1)));
      pose.pitch += 0.14;
      pose.lift = -1.4 * (reducedMotion ? 0 : 1);
      pose.sy = 1.08;
      pose.sx = 1.04;
      pose.eyes = both({ w: 1.5 + 0.12 * open, h: 1.3 + 0.1 * open });
      pose.faceY = -0.35;
      pose.blink = reducedMotion ? 0 : Math.max(blinkAround(0.78), blinkAround(0.87));
      break;
    }
    case 'angry': {
      // Leans in and glares, body held still: with each slow huff the lids narrow and the slant deepens.
      const p = at(2.8, 0.5);
      const huff = Math.max(0, Math.sin(Math.PI * clamp(p / 0.35, 0, 1)));
      pose.pitch -= 0.1;
      pose.yaw += 0.03 * sway * wave(5.2);
      pose.lift = -0.3 * huff;
      pose.sx = 1.03 + 0.02 * huff;
      pose.sy = 0.98 - 0.02 * huff;
      pose.eyes = both({ w: 1.9, h: 0.32 - 0.1 * huff, tilt: 0.3 + 0.12 * huff });
      pose.faceY = 0.2;
      pose.gazeX = 0.15 * wave(6.3);
      pose.gazeY = 0.2;
      break;
    }
    case 'sad': {
      // Slumped and slow: squashed low, tipped forward, small drooping eyes low on the face.
      pose.yaw += 0.05 * sway * wave(8.3);
      pose.pitch -= 0.16;
      pose.roll = -3 + 0.8 * wave(7.1);
      pose.sy = 0.95;
      pose.sx = 1.02;
      breathe(5.8, 0.01);
      pose.eyes = both({ w: 1.15, h: 0.75, tilt: 0.48 });
      pose.faceY = 1;
      pose.gazeX = -0.15 + 0.1 * wave(9.4);
      pose.gazeY = 0.6;
      pose.blink = blinks(0.5);
      break;
    }
    case 'sleepy': {
      // Heavy, sagging lids; drifts off with the head sinking and eyes closing, then jerks back up.
      const p = at(5.6, 0.3);
      const doze = p < 0.82 ? smooth(p / 0.82) : 1 - smooth((p - 0.82) / 0.06);
      pose.pitch -= 0.06 + 0.12 * doze;
      pose.roll = 5 + 3 * doze;
      pose.sy = 1 - 0.035 * doze;
      breathe(4.8, 0.02);
      pose.eyes = both({ w: 1.7, h: 0.55, lid: 0.15, sag: 0.25 });
      pose.faceY = 0.4 + 0.25 * doze;
      pose.gazeY = 0.35;
      pose.blink = 0.25 + 0.75 * doze * doze;
      break;
    }
    case 'thinking': {
      pose.yaw += 0.12 + 0.05 * sway * wave(7.3);
      pose.pitch += 0.08;
      pose.roll = -5 + 1.4 * wave(4.1);
      pose.lift = -0.5 * (1 - Math.cos((TAU * t) / 5.2)) * live;
      pose.gazeX = 0.55 + 0.3 * wave(5.6);
      pose.gazeY = -0.8;
      pose.eyes = [eye({ lid: 0.1 }), eye({ lid: 0.14 + 0.04 * wave(3.1) })];
      pose.faceX = 0.3;
      pose.faceY = -0.35;
      pose.blink = blinks(0.7);
      break;
    }
    default: {
      pose.yaw += 0.07 * sway * wave(6.1);
      pose.pitch += 0.04 * sway * wave(4.7, 1);
      pose.roll = 1.6 * wave(5.3, 2);
      pose.lift = -0.45 * (1 - Math.cos((TAU * t) / 3.4)) * live;
      breathe(3.4, 0.012);
      if (!reducedMotion) {
        pose.blink = blinkAt(seed, t);
        [pose.gazeX, pose.gazeY] = wanderAt(seed, t);
      }
    }
  }

  const k = fit ? clamp(fit(motion), 0, 1) : 1;
  pose.eyes = [tameEye(pose.eyes[0], k), tameEye(pose.eyes[1], k)];
  pose.faceX = clamp(pose.faceX, -1, 1) * k;
  pose.faceY = clamp(pose.faceY, -1, 1) * k;

  if (given && weight > 0) {
    // A look target wins over idle wander. The body turns to face it: the resting
    // three-quarter turn gives way (so a target on either side turns the front that
    // way) and the eyes add a modest share on top. Reduced motion keeps the body
    // still, so the eyes alone use their full (still small) range.
    const mix = (a: number, b: number) => a + (b - a) * weight;
    const share = reducedMotion ? 1 : LOOK_EYES;
    pose.gazeX = mix(pose.gazeX, given[0] * share);
    pose.gazeY = mix(pose.gazeY, given[1] * share);
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
