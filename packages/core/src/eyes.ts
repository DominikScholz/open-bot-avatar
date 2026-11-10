/**
 * The outline of one eye for any look. The plain pill and the happy arc are each walked as a
 * closed outline from the top centre, clockwise, at even steps; mixing the two point by point
 * gives every shape in between, so a change of mood morphs the eyes instead of swapping them.
 * Lids cut the pill from above. Nothing here reaches past the room validation leaves around an
 * eye: lids only remove ink, and a wide-open eye grows into the room its gaze would travel.
 */
import type { EyeLook } from './motion.ts';
import type { Point } from './path.ts';
import { HAPPY_ARC } from './validate.ts';

/** Where one eye is drawn this frame, in its face plane (viewBox units). */
export interface EyeSpot {
  /** Centre, gaze included. */
  x: number;
  y: number;
  /** Neutral size. */
  w: number;
  h: number;
  /** Height of the pill after blink and squint, and how far that moves it down. */
  open: number;
  shift: number;
  /** Room around the eye, per axis, that a wide-open eye grows into. */
  roomX: number;
  roomY: number;
  /** Which way the outer side lies: -1 for the left eye, 1 for the right. */
  outer: 1 | -1;
}

/** Points per outline. */
const STEPS = 40;
/** How much of the eye's height the lid's slope adds at one end and takes off at the other. */
const SLANT = 0.24;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** `count` points at even steps along a closed polyline, the first one at its first point. */
function resample(pts: Point[], count: number): Point[] {
  const n = pts.length;
  const at: number[] = [0];
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    at.push(at[i] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = at[n];
  const out: Point[] = [];
  let i = 0;
  for (let k = 0; k < count; k++) {
    const s = (k / count) * total;
    while (i < n - 1 && at[i + 1] < s) i++;
    const a = pts[i], b = pts[(i + 1) % n];
    const u = at[i + 1] > at[i] ? (s - at[i]) / (at[i + 1] - at[i]) : 0;
    out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
  }
  return out;
}

/** An arc of a circle as points, from angle `from` to `to` (radians, y down), ends included. */
function sweep(cx: number, cy: number, r: number, from: number, to: number, steps: number): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = from + ((to - from) * i) / steps;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

/** The pill: a stadium `w` wide and `h` tall about (cx, cy), from the top centre, clockwise. */
function pill(cx: number, cy: number, w: number, h: number): Point[] {
  const r = Math.min(w, h) / 2;
  const fx = w / 2 - r, fy = h / 2 - r;
  const q = Math.PI / 2;
  return [
    [cx, cy - h / 2] as Point,
    ...sweep(cx + fx, cy - fy, r, -q, 0, 6),
    ...sweep(cx + fx, cy + fy, r, 0, q, 6),
    ...sweep(cx - fx, cy + fy, r, q, 2 * q, 6),
    ...sweep(cx - fx, cy - fy, r, 2 * q, 3 * q, 6),
  ];
}

/** The happy arc as an outline: its stroke's two edges and round ends, from the top centre, clockwise. */
function arc(e: EyeSpot): Point[] {
  const hw = e.w * HAPPY_ARC.halfWidth, base = e.y + e.h * HAPPY_ARC.base, peak = e.y - e.h * HAPPY_ARC.peak;
  const r = (e.w * HAPPY_ARC.stroke) / 2;
  // The centre line and its upward normal at s (0 = left end, 1 = right end).
  const at = (s: number): { p: Point; n: Point } => {
    const m = 1 - s;
    const x = e.x + hw * (2 * s - 1), y = (m * m + s * s) * base + 2 * m * s * peak;
    const tx = 2 * hw, ty = 2 * (2 * s - 1) * (base - peak);
    const len = Math.hypot(tx, ty);
    return { p: [x, y], n: [ty / len, -tx / len] };
  };
  const edge = (from: number, to: number, side: 1 | -1): Point[] => {
    const pts: Point[] = [];
    for (let i = 0; i <= 8; i++) {
      const { p, n } = at(from + ((to - from) * i) / 8);
      pts.push([p[0] + n[0] * r * side, p[1] + n[1] * r * side]);
    }
    return pts;
  };
  const end = (s: 0 | 1): Point[] => {
    const { p, n } = at(s);
    const up = Math.atan2(n[1], n[0]);
    // Round the end from the upper edge to the lower one, the long way round its tip.
    return s === 1 ? sweep(p[0], p[1], r, up, up + Math.PI, 8) : sweep(p[0], p[1], r, up + Math.PI, up + 2 * Math.PI, 8);
  };
  return [...edge(0.5, 1, 1), ...end(1), ...edge(1, 0, -1), ...end(0), ...edge(0, 0.5, 1)];
}

/** Whether a look is exactly the plain pill or exactly the happy arc: those are drawn as before. */
export function plainLook(look: EyeLook): 'pill' | 'arc' | null {
  if (look.arc >= 1) return 'arc';
  return look.arc <= 0 && look.lid <= 0 && look.slant === 0 && look.wide <= 0 ? 'pill' : null;
}

/** The outline of one eye, closed, clockwise from the top. */
export function eyeOutline(look: EyeLook, e: EyeSpot): Point[] {
  const wide = clamp(look.wide, 0, 1), k = clamp(look.arc, 0, 1);
  const w = e.w + 2 * e.roomX * wide, h = e.open + 2 * e.roomY * wide;
  const cy = e.y + e.shift;
  const top = cy - h / 2;
  // The lid never closes the eye past a slit as tall as the eye is wide.
  const floor = cy + h / 2 - Math.min(h, w);
  const lid = clamp(look.lid, 0, 1), slant = clamp(look.slant, -1, 1) * SLANT;
  const pts = resample(pill(e.x, cy, w, h), STEPS).map(([x, y]): Point => {
    const across = clamp((x - e.x) / (w / 2), -1, 1) * e.outer;
    const cut = top + h * Math.max(0, lid + slant * across);
    return [x, Math.max(y, Math.min(cut, floor))];
  });
  if (k <= 0) return pts;
  const happy = resample(arc(e), STEPS);
  return pts.map(([x, y], i) => [x + (happy[i][0] - x) * k, y + (happy[i][1] - y) * k]);
}

const f = (n: number) => {
  const r = Math.round(n * 100) / 100;
  return (Object.is(r, -0) ? 0 : r).toString();
};

/** A smooth closed path through an outline: a quadratic per point, joined at the midpoints. Absolute M, Q and Z only. */
export function outlinePath(pts: Point[]): string {
  const n = pts.length;
  const mid = (i: number): Point => {
    const a = pts[i % n], b = pts[(i + 1) % n];
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  };
  const start = mid(n - 1);
  let d = `M${f(start[0])} ${f(start[1])}`;
  for (let i = 0; i < n; i++) {
    const m = mid(i);
    d += `Q${f(pts[i][0])} ${f(pts[i][1])} ${f(m[0])} ${f(m[1])}`;
  }
  return `${d}Z`;
}

/** The path of one eye for a look that is neither the plain pill nor the plain arc. */
export function eyePath(look: EyeLook, e: EyeSpot): string {
  return outlinePath(eyeOutline(look, e));
}
