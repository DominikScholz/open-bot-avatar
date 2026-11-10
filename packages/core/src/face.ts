/**
 * Expressive eyes: each eye is a stadium (the neutral pill) bent into a mood by a few numbers,
 * so any two expressions blend by mixing those numbers and the eyes morph instead of swapping.
 * See docs/avatar-contract.md for how far an expression may reach.
 */
import type { Point } from './path.ts';

export interface EyeParams {
  /** Width and height relative to the neutral pill. */
  w: number;
  h: number;
  /** Rotation, radians. Positive turns the top inward (a flat eye then dips at its inner end). */
  tilt: number;
  /** Top lid lowered by this share of the height. */
  lid: number;
  /** Top lid sagging in the middle by this share of the height (a bean shape). */
  sag: number;
  /** Bottom pushed up in the middle by this share of the height (a ∩ arch). */
  arch: number;
  /** Middle bowed inward by this share of the half width (a > < chevron). */
  bend: number;
}

export const NEUTRAL_EYE: EyeParams = { w: 1, h: 1, tilt: 0, lid: 0, sag: 0, arch: 0, bend: 0 };

/** Furthest the whole face (both eyes) travels from its place, per axis, in eye-scale units. */
export const FACE_TRAVEL = 2.5;

const KEYS = Object.keys(NEUTRAL_EYE) as (keyof EyeParams)[];

export function eye(o: Partial<EyeParams> = {}): EyeParams {
  return { ...NEUTRAL_EYE, ...o };
}

export function mixEyes(a: EyeParams, b: EyeParams, t: number): EyeParams {
  const out = { ...a };
  for (const k of KEYS) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
}

/**
 * The expression `k` (0..1) of the way from neutral: growth, tilt and bend scale down, while
 * shrinking, lids and arches stay (they only remove ink). At 0 the eye fits the neutral pill.
 */
export function tameEye(e: EyeParams, k: number): EyeParams {
  const grow = (v: number) => (v > 1 ? 1 + (v - 1) * k : v);
  return { ...e, w: grow(e.w), h: grow(e.h), tilt: e.tilt * k, bend: e.bend * k };
}

const SAMPLES = 36;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Evenly spaced points around a stadium centered on 0, 0. */
function stadium(W: number, H: number): Point[] {
  const wide = W >= H;
  const r = Math.min(W, H) / 2, half = Math.abs(W - H) / 2;
  const per = 4 * half + 2 * Math.PI * r;
  const pts: Point[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    let s = (i / SAMPLES) * per;
    let p: Point;
    // Walk: first straight side, first cap, second straight side, second cap.
    if (s < 2 * half) p = [-half + s, -r];
    else if ((s -= 2 * half) < Math.PI * r) { const a = -Math.PI / 2 + s / r; p = [half + Math.cos(a) * r, Math.sin(a) * r]; }
    else if ((s -= Math.PI * r) < 2 * half) p = [half - s, r];
    else { s -= 2 * half; const a = Math.PI / 2 + s / r; p = [-half + Math.cos(a) * r, Math.sin(a) * r]; }
    pts.push(wide ? p : [p[1], -p[0]]);
  }
  return pts;
}

export interface EyeFrame {
  /** Center, viewBox units. */
  x: number;
  y: number;
  /** Neutral pill size. */
  w: number;
  h: number;
  /** +1 when the face center lies to the eye's right (the left eye), -1 otherwise. */
  inward: 1 | -1;
  /** 0 = open, 1 = closed (to a slit). */
  blink: number;
  /** Grow every side by this much (a clearance margin when testing fit). */
  inflate?: number;
}

/** The outline of one eye, closed, in face-plane coordinates. */
export function eyePoints(e: EyeParams, f: EyeFrame): Point[] {
  const pad = f.inflate ?? 0;
  const W = Math.max(f.w * e.w, f.w * 0.3);
  const H0 = Math.max(f.h * e.h, f.w * 0.3);
  // Blinks close toward a point below center and never thinner than a slit.
  const open = Math.max(H0 * (1 - clamp01(f.blink)), Math.min(H0, f.w * 0.5));
  const shift = (H0 - open) * 0.18;
  const H = open;
  const Wp = W + 2 * pad, Hp = H + 2 * pad;
  const slit = Math.min(Hp, f.w * 0.45 + 2 * pad);
  const cos = Math.cos(e.tilt * f.inward), sin = Math.sin(e.tilt * f.inward);
  return stadium(Wp, Hp).map(([x, y]) => {
    const u = Math.min(1, Math.abs(x) / (Wp / 2));
    let top = -Hp / 2 + (clamp01(e.lid) + Math.max(0, e.sag) * (1 - u * u)) * H;
    let bottom = Hp / 2 - clamp01(e.arch) * H * Math.max(0, 1 - (u / 0.8) ** 2);
    if (bottom - top < slit) {
      const m = (top + bottom) / 2;
      top = m - slit / 2;
      bottom = m + slit / 2;
    }
    const yy = Math.min(bottom, Math.max(top, y));
    const v = yy / (Hp / 2);
    const xx = x + f.inward * e.bend * (W / 2) * Math.max(0, 1 - v * v);
    return [f.x + xx * cos - yy * sin, f.y + shift + xx * sin + yy * cos];
  });
}

const r2 = (n: number) => {
  const r = Math.round(n * 100) / 100;
  return (Object.is(r, -0) ? 0 : r).toString();
};

/** A smooth closed path through an outline: quadratics between edge midpoints. Absolute M, Q and Z only. */
export function outlinePath(pts: Point[]): string {
  const n = pts.length;
  const mid = (i: number): Point => {
    const a = pts[i % n], b = pts[(i + 1) % n];
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  };
  const m0 = mid(0);
  let d = `M${r2(m0[0])} ${r2(m0[1])}`;
  for (let i = 1; i <= n; i++) {
    const p = pts[i % n], m = mid(i);
    d += `Q${r2(p[0])} ${r2(p[1])} ${r2(m[0])} ${r2(m[1])}`;
  }
  return d + 'Z';
}
