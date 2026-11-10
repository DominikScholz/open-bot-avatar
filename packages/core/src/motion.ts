/**
 * Deterministic pose model. A pose is a pure function of (seed, time, motion,
 * gaze, reducedMotion): no wall clock, no Math.random, so any frame can be
 * reproduced exactly (tests, SSR, scrubbing).
 */
import { eye, mixEyes, tameEye, type EyeParams } from './face.ts';
import type { AvatarActivity, AvatarMotion, AvatarMotionBlend } from './types.ts';

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
  'idle', 'happy', 'excited', 'celebrate', 'determined', 'surprised', 'angry', 'sad', 'sleepy',
];

/** Every activity, in the order hosts list them. */
export const ACTIVITIES: readonly AvatarActivity[] = ['thinking', 'listening', 'speaking', 'working', 'waiting', 'success', 'error'];

/** `thinking` was a mood before activities existed and is still accepted as one: it means the thinking activity. */
export function isMotion(value: unknown): value is AvatarMotion {
  return value === 'thinking' || MOTIONS.includes(value as AvatarMotion);
}

export function isActivity(value: unknown): value is AvatarActivity {
  return ACTIVITIES.includes(value as AvatarActivity);
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
  /** What the bot is doing on top of its mood (see withActivity); `motion: 'thinking'` alone means idle plus the thinking activity. */
  activity?: AvatarActivity;
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
  fit?: (motion: AvatarMotion, activity?: AvatarActivity) => number;
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
  return blendPoses(computePose({ ...input, motion: from.motion, activity: from.activity, blend: from.blend }), pose, Number.isFinite(blend.t) ? blend.t : 1);
}

const both = (o: Partial<EyeParams> = {}): [EyeParams, EyeParams] => [eye(o), eye(o)];
/** Position 0..1 within a repeating cycle. */
const cycle = (t: number, period: number) => (((t % period) + period) % period) / period;

/** The clocks every pose is built from. Reduced motion freezes time at 0 and picks the still value of each cycle. */
function clock(seed: number, time: number, reducedMotion: boolean) {
  // Per-avatar phase offset so several avatars on a page do not move in lockstep.
  const t = reducedMotion ? 0 : time + noise(seed, 7) * 10;
  return {
    t,
    live: reducedMotion ? 0 : 1,
    wave: (period: number, phase = 0) => (reducedMotion ? 0 : Math.sin((TAU * t) / period + phase)),
    at: (period: number, still: number) => (reducedMotion ? still : cycle(t, period)),
    blinks: (rate = 1) => (reducedMotion ? 0 : blinkAt(seed, t * rate)),
  };
}

function lookOf(gaze: PoseInput['gaze']) {
  const given = gaze && Number.isFinite(gaze.x) && Number.isFinite(gaze.y)
    ? [clamp(gaze.x, -1, 1), clamp(gaze.y, -1, 1)] as [number, number]
    : null;
  const weight = given ? (Number.isFinite(gaze?.weight) ? clamp(gaze?.weight as number, 0, 1) : 1) : 0;
  return { given, weight };
}

/** The mood alone, before fit, look target and view. `calm` drops the full spin of celebrate. */
function basePose({ seed, time, motion, gaze, reducedMotion }: PoseInput, calm: boolean): Pose {
  const { t, live, wave, at, blinks } = clock(seed, time, reducedMotion);
  // While it attends to a target the body holds its aim: idle sway of the turn settles to a trace.
  const sway = 1 - 0.7 * lookOf(gaze).weight;

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
      pose.yaw += TAU * spin * live * (calm ? 0 : 1);
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

  return pose;
}

interface Offsets {
  yaw: number; pitch: number; roll: number; lift: number; sx: number; sy: number;
  gazeX: number; gazeY: number; blink: number; faceX: number; faceY: number;
  /** Per eye: width and height factors and extra top lid, applied to the mood's eyes. */
  w: [number, number];
  h: [number, number];
  lid: [number, number];
  /** Least arch of both eyes: lifts flat eyes into a smile and leaves eyes that already arch more alone. */
  arch: number;
}

const offsets = (o: Partial<Offsets>): Offsets => ({
  yaw: 0, pitch: 0, roll: 0, lift: 0, sx: 1, sy: 1, gazeX: 0, gazeY: 0, blink: 0, faceX: 0, faceY: 0,
  w: [1, 1], h: [1, 1], lid: [0, 0], arch: 0, ...o,
});

const hump = (u: number) => Math.sin(Math.PI * clamp(u, 0, 1));
/** Two dips inside one swell: a double nod, a double hop. */
const twice = (u: number) => (u <= 0 || u >= 1 ? 0 : hump(u) * (0.5 - 0.5 * Math.cos(2 * TAU * u)));
/** Holds -1 or 1, swapping sides every `period` seconds over `ease` seconds; -1 when time stands still. */
const flip = (t: number, period: number, ease: number) => {
  const s = Math.floor(t / period);
  return (s % 2 === 0 ? 1 : -1) * (2 * smooth((t - s * period) / ease) - 1);
};

/** What each activity adds to the damped mood body: rhythm, gaze, lids. Reduced motion keeps only the static parts. */
function activityOffsets(activity: AvatarActivity, seed: number, c: ReturnType<typeof clock>, sway: number): Offsets {
  const { t, live, wave, at, blinks } = c;
  switch (activity) {
    case 'thinking': {
      // Looks up and away to one side, the far eye squinting, then mulls it over on the other side.
      const side = flip(t, 3.8, 0.7);
      const far = Math.max(0, side), near = Math.max(0, -side);
      return offsets({
        yaw: 0.01 - 0.11 * side + 0.05 * sway * wave(7.3), pitch: 0.09 + 0.03 * wave(3.8), roll: 5 * side + 1.4 * wave(4.1),
        lift: -0.5 * (1 - Math.cos((TAU * t) / 5.2)) * live,
        gazeX: -0.6 * side + 0.2 * wave(5.6), gazeY: -0.8, lid: [0.1 + 0.2 * far, 0.1 + 0.2 * near],
        faceX: -0.35 * side, faceY: -0.4, blink: blinks(0.7),
      });
    }
    case 'listening': {
      // Perked up and square to the viewer with the head cocked, nodding along twice, then cocked the other way.
      const cock = flip(t, 6.4, 0.6);
      const nod = twice((at(3.2, 0) - 0.12) / 0.34);
      return offsets({
        yaw: 0.24 + 0.02 * sway * wave(9), pitch: -0.1 - 0.14 * nod, roll: 6 * cock, lift: -0.7 + 0.5 * nod * live,
        sx: 1.03, sy: 1.04 - 0.035 * nod, w: [1.12, 1.12], h: [1.18, 1.18], faceY: -0.1, blink: blinks(0.5),
      });
    }
    case 'speaking': {
      // The eyes stand in for a mouth: squat at rest, popping tall on each syllable while the body bounces.
      // Two syllable trains of different length and seeded strength, in phrases turned to one side or the other.
      const syllable = (len: number, k: number) => {
        const s = Math.floor(t / len), amp = noise(seed, k + s);
        return amp < 0.2 ? 0 : (0.4 + 0.6 * amp) * hump(t / len - s);
      };
      const PHRASE = 2.7, ph = Math.floor(t / PHRASE), u = t / PHRASE - ph;
      const talk = 0.72 + 0.22 * noise(seed, 5000 + ph);
      const gate = smooth(u / 0.06) * (1 - smooth((u - talk) / 0.06));
      const bob = live * gate * Math.min(1, 0.75 * syllable(0.21, 3000) + 0.55 * syllable(0.33, 4000));
      const aim = (k: number) => noise(seed, 5100 + k) * 2 - 1;
      const turn = live * (aim(ph - 1) + (aim(ph) - aim(ph - 1)) * smooth(u / 0.18));
      const open = 0.85 + 0.42 * bob, wide = 1.14 - 0.16 * bob;
      return offsets({
        yaw: 0.14 + 0.2 * turn, pitch: 0.04 - 0.08 * bob, roll: 3 * turn, lift: -2.1 * bob,
        sx: 1 - 0.03 * bob, sy: 1 + 0.05 * bob, gazeX: 0.25 * turn, w: [wide, wide], h: [open, open], faceY: -0.1, blink: blinks(0.8),
      });
    }
    case 'working': {
      // Hunched over the work: reads along a line in steady saccades, body turning with it and tapping away,
      // and every so often looks up to check before diving back in.
      const STEP = 0.3, LINE = 6, n = Math.floor(t / STEP);
      const x = (k: number) => (((k % LINE) + LINE) % LINE) / (LINE - 1) * 2 - 1;
      const up = hump((at(7.2, 0) - 0.78) / 0.17), down = 1 - up;
      const scan = (live ? x(n - 1) + (x(n) - x(n - 1)) * smooth((t / STEP - n) / 0.35) : -0.4) * down;
      const tap = wave(0.24) * down;
      return offsets({
        yaw: 0.04 + 0.17 * scan, pitch: -0.2 + 0.26 * up, roll: 1.1 * tap, lift: -0.35 * (0.5 + 0.5 * tap) * live,
        sx: 1.04 - 0.03 * up, sy: 0.95 + 0.05 * up, gazeX: 0.6 * scan, gazeY: 0.5 - 0.7 * up,
        h: [0.9 + 0.2 * up, 0.9 + 0.2 * up], lid: [0.32 * down, 0.32 * down], faceX: 0.35 * scan, faceY: 0.45 - 0.55 * up,
        blink: blinks(0.4),
      });
    }
    case 'waiting': {
      // Rocks from side to side looking off into the distance, then turns, leans in wide-eyed and hops twice: well?
      const p = at(5.2, 0), u = (p - 0.6) / 0.32;
      const ask = hump(u), idle = 1 - ask, rock = wave(2.6) * idle;
      const blinkAround = (at: number) => hump((p - at) / 0.035);
      return offsets({
        yaw: 0.05 - 0.09 * wave(2.6, 1.2) * idle + 0.2 * ask, pitch: 0.03 - 0.15 * ask, roll: 2.5 * idle + 6 * rock,
        lift: -0.6 * rock * rock * live - 1.7 * twice(u) * live, sx: 1 + 0.04 * ask, sy: 1 + 0.05 * ask,
        gazeX: (-0.55 + 0.2 * wave(7.9)) * idle, gazeY: -0.5 * idle, h: [1 + 0.25 * ask, 1 + 0.25 * ask], lid: [0.14 * idle, 0.14 * idle],
        faceX: -0.2 * idle, faceY: -0.15, blink: live ? Math.max(blinks(0.8) * idle, blinkAround(0.79), blinkAround(0.84)) : 0,
      });
    }
    case 'success': {
      // One hop of joy with smiling eyes, two firm nods, then it stands proud until the cycle comes round.
      const p = at(3.4, 0.6), u = p / 0.2;
      const hop = p < 0.2 ? 4 * u * (1 - u) : 0, land = hump((p - 0.2) / 0.08), nod = twice((p - 0.3) / 0.3);
      const joy = live ? smooth(p / 0.06) * (1 - smooth((p - 0.62) / 0.12)) : 0.6;
      return offsets({
        yaw: 0.2, pitch: 0.07 - 0.13 * nod, roll: 2 * wave(3.4), lift: -0.7 - 2.8 * hop + 0.4 * nod,
        sx: 1.01 - 0.03 * hop + 0.06 * land, sy: 1.02 + 0.06 * hop - 0.07 * land - 0.03 * nod,
        w: [1 + 0.6 * joy, 1 + 0.6 * joy], h: [1.08 - 0.4 * joy, 1.08 - 0.4 * joy], arch: 0.55 * joy,
        faceY: -0.2, blink: blinks(0.6) * (1 - joy),
      });
    }
    case 'error': {
      // A short head shake with a flinch, then held off balance and uneasy until the cycle comes round.
      const p = at(5, 0.5), s = p / 0.16;
      const swell = p < 0.16 ? hump(s) : 0, shake = swell * Math.sin(TAU * 2.5 * s);
      return offsets({
        yaw: -0.08 + 0.3 * shake, pitch: -0.04 - 0.06 * swell, roll: -3.5 + 3.5 * shake + 0.6 * wave(3.7), sx: 1 + 0.03 * swell, sy: 0.99 - 0.04 * swell,
        gazeX: 0.35 + 0.08 * wave(2.3), gazeY: 0.3, h: [1.1, 0.8], lid: [0, 0.1], faceY: 0.1, blink: blinks(0.9),
      });
    }
  }
}

/**
 * The mood's face with an activity's body. The mood keeps its eyes, face placement and static
 * posture (taken from its still pose); its own body motion keeps only a share, and the activity
 * adds rhythm, gaze and lids on top. The activity never replaces the mood's eyes, it scales them.
 */
function withActivity(input: PoseInput, activity: AvatarActivity): Pose {
  const DAMP = 0.12, GAZE = 0.25;
  const live = basePose(input, true);
  const still = basePose({ ...input, reducedMotion: true }, true);
  const c = clock(input.seed, input.time, input.reducedMotion);
  const o = activityOffsets(activity, input.seed, c, 1 - 0.7 * lookOf(input.gaze).weight);
  const breath = c.wave(4, -Math.PI / 2);
  const keep = (now: number, rest: number) => rest + (now - rest) * DAMP;
  const eyeOf = (e: EyeParams, i: number): EyeParams => ({ ...e, w: e.w * o.w[i], h: e.h * o.h[i], lid: clamp(e.lid + o.lid[i], 0, 1), arch: Math.max(e.arch, o.arch) });
  return {
    yaw: keep(live.yaw, still.yaw) + o.yaw,
    pitch: keep(live.pitch, still.pitch) + o.pitch,
    roll: keep(live.roll, still.roll) + o.roll,
    lift: keep(live.lift, still.lift) + o.lift,
    sx: keep(live.sx, still.sx) * o.sx * (1 - 0.005 * breath),
    sy: keep(live.sy, still.sy) * o.sy * (1 + 0.008 * breath),
    gazeX: clamp(still.gazeX * GAZE + o.gazeX, -1, 1),
    gazeY: clamp(still.gazeY * GAZE + o.gazeY, -1, 1),
    blink: Math.max(still.blink, o.blink),
    eyes: [eyeOf(still.eyes[0], 0), eyeOf(still.eyes[1], 1)],
    faceX: still.faceX + o.faceX,
    faceY: still.faceY + o.faceY,
  };
}

function moodPose(input: PoseInput): Pose {
  const { gaze, reducedMotion, view, fit } = input;
  // `thinking` began as a mood: alone it is idle plus the thinking activity, and an explicit activity wins.
  const motion = input.motion === 'thinking' ? 'idle' : input.motion;
  const activity = isActivity(input.activity) ? input.activity : input.motion === 'thinking' ? 'thinking' : undefined;
  const pose = activity ? withActivity({ ...input, motion }, activity) : basePose({ ...input, motion }, false);
  const { given, weight } = lookOf(gaze);

  const k = fit ? clamp(fit(motion, activity), 0, 1) : 1;
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
