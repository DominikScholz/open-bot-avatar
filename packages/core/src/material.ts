/**
 * The `soft` material: a subsurface-scattering colour ramp for the body's cross-sections,
 * ported from the soft-shape fragment shader used in the Hark design study.
 *
 * The renderer already implies volume as stacked cross-sections; this module gives each
 * slice a colour by how deep it sits in that volume, instead of one flat body colour.
 * Light entering the body is absorbed per channel by `density * (1 - linear(color))`,
 * so a slice's colour is the body colour times the light that survives the travel to it:
 * the surface keeps the exact body colour, deeper slices sink into a richer, saturated
 * version of the same hue — never toward gray. Pale bodies absorb little and stay airy;
 * saturated bodies glow from within. An optional `lift` screens a floor colour over the
 * result (the night-floor trick) so near-black bodies keep a readable volume.
 *
 * Pure and dependency-free: a ramp is a small lookup table computed once per colour and
 * material, then indexed by each slice's `tone` (0 = surface, 1 = deepest).
 */

import { parseHex, toHex } from './color.ts';
import type { Rgb } from './color.ts';
import type { VolumePart, VolumeSlice } from './volume.ts';

export interface SoftMaterial {
  /** Absorption strength of the body. Higher = deeper, richer shadows. Default 2.2. */
  density?: number;
  /** Share of ambient (undirected) light, 0..1. Higher = flatter, brighter volume. Default 0.5. */
  ambient?: number;
  /** Optical travel across the full depth. Higher = stronger falloff. Default 2.4. */
  spread?: number;
  /** Key-light cone width in degrees (source shader u_softness). Default 14. */
  softness?: number;
  /** Night-floor lift 0..1: screen a floor colour over the result so dark bodies read. Default 0. */
  lift?: number;
  /** Floor colour for `lift`, #rgb or #rrggbb. Default #5B698D (a night-sky stop). */
  liftColor?: string;
}

export const DEFAULT_SOFT = { density: 2.2, ambient: 0.5, spread: 2.4, lift: 0, liftColor: '#5B698D' } as const;

/** Ramp resolution: slices index it by tone, so 24 steps are far below one visible band. */
export const RAMP_STEPS = 24;

const toLinear = (v: number) => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (v: number) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * The soft-material colours of a body, surface first (index 0 = the exact body colour)
 * and deepest last. Normalized so the surface reads as the body itself, not a tint of it.
 */
export function softRamp(color: Rgb, material: SoftMaterial = {}, steps = RAMP_STEPS): Rgb[] {
  const m = { ...DEFAULT_SOFT, ...material };
  const density = Math.max(0, m.density);
  const ambient = clamp01(m.ambient);
  const spread = Math.max(0.01, m.spread);
  const lift = clamp01(m.lift);
  const lin = color.map(toLinear) as Rgb;
  const absorb = lin.map((v) => density * (1 - v)) as Rgb;
  const floor = (parseHex(m.liftColor) ?? [91, 105, 141]).map((v) => v / 255) as Rgb;
  const out: Rgb[] = [];
  for (let i = 0; i < steps; i++) {
    const t = steps > 1 ? i / (steps - 1) : 0;
    const lit = lin.map((v, ch) => {
      const key = Math.exp(-absorb[ch] * t * spread);
      const amb = Math.exp(-absorb[ch] * t * spread * 0.6);
      const g = clamp01(fromLinear((v * (key + ambient * amb)) / (1 + ambient)) / 255);
      return 255 * (1 - (1 - g) * (1 - floor[ch] * lift));
    }) as Rgb;
    out.push(lit.map((v) => Math.min(255, Math.max(0, v))) as Rgb);
  }
  return out;
}

/** The ramp colour at tone `t` (0..1), linearly between steps. */
export function rampAt(ramp: Rgb[], t: number): Rgb {
  const x = clamp01(t) * (ramp.length - 1);
  const n = Math.min(Math.floor(x), ramp.length - 2);
  const f = x - n;
  return [0, 1, 2].map((ch) => ramp[n][ch] + (ramp[n + 1][ch] - ramp[n][ch]) * f) as Rgb;
}

const hexRamps = new Map<string, Rgb[]>();

/** rampAt for a ramp of hex stops (as AvatarFrame.ramp carries), cached per ramp. */
export function rampHexAt(ramp: string[], t: number): string {
  const key = ramp.join(',');
  let rgb = hexRamps.get(key);
  if (!rgb) {
    rgb = ramp.map((c) => parseHex(c) as Rgb);
    if (hexRamps.size > 64) hexRamps.clear();
    hexRamps.set(key, rgb);
  }
  return toHex(rampAt(rgb, t));
}

/**
 * Where a cross-section sits in its part's volume, 0 (surface) .. 1 (deepest).
 * z-slices run front (+depth/2) to back; x-slices (the side stack) approximate travel
 * by distance from the silhouette edge, so side views keep a lit rim and a deep core.
 */
export function sliceTone(part: Pick<VolumePart, 'depth' | 'thickness'>, slice: VolumeSlice): number {
  if (slice.axis === 'z') return clamp01((part.depth / 2 - slice.at) / Math.max(part.depth, 1e-6));
  return clamp01(1 - Math.abs(slice.at) / Math.max(part.thickness / 2, 1e-6));
}
