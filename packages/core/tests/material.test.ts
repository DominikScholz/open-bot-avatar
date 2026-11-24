import { describe, expect, it } from 'vitest';
import { luminance, parseHex, toOklch } from '../src/color.ts';
import type { Rgb } from '../src/color.ts';
import { DEFAULT_SOFT, rampAt, rampHexAt, sliceTone, softRamp } from '../src/material.ts';
import { softSprite } from '../src/softsprite.ts';
import { HARK, HARK_ROSTER, HARK_SKY, harkBot, harkSky } from '../src/presets/hark.ts';
import { avatarFrame, renderAvatarScene, renderAvatarSvg, sceneFrame } from '../src/render.ts';
import { getExample } from '../src/examples.ts';
import { validateAvatar } from '../src/validate.ts';

const hex = (c: Rgb) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

describe('softRamp', () => {
  it('keeps the exact body colour at the surface', () => {
    for (const c of ['#65A3DD', '#FF4D00', '#00A665', '#F5F5F7', '#2A3256']) {
      const ramp = softRamp(parseHex(c) as Rgb);
      expect(hex(ramp[0])).toBe(c.toLowerCase());
    }
  });

  it('sinks deeper slices into a darker tone of the same hue, never toward gray', () => {
    for (const c of ['#65A3DD', '#FF4D00', '#00A665', '#DA2F35', '#FEC768']) {
      const ramp = softRamp(parseHex(c) as Rgb);
      const lights = ramp.map((s) => luminance(s));
      for (let i = 1; i < lights.length; i++) expect(lights[i]).toBeLessThanOrEqual(lights[i - 1] + 1e-9);
      const hue0 = toOklch(ramp[0])[2];
      const hue1 = toOklch(ramp[ramp.length - 1])[2];
      const drift = Math.abs(((hue1 - hue0 + 540) % 360) - 180);
      // Per-channel absorption turns warm hues toward amber in the depth (as in the
      // source shader); the hue stays in the family and the chroma stays rich.
      expect(drift).toBeLessThan(45);
      expect(toOklch(ramp[ramp.length - 1])[1]).toBeGreaterThan(0.02);
    }
  });

  it('gives a pale body readable volume at a denser material', () => {
    const flat = softRamp(parseHex('#F5F5F7') as Rgb, { density: 1.2, ambient: 0.55 });
    const sculpted = softRamp(parseHex('#F5F5F7') as Rgb, { density: 5, ambient: 0.12 });
    const drop = (r: Rgb[]) => luminance(r[0]) - luminance(r[r.length - 1]);
    expect(drop(sculpted)).toBeGreaterThan(drop(flat) * 2);
  });

  it('lifts a near-black body with the night floor', () => {
    const ink = parseHex('#1D1D1F') as Rgb;
    const plain = softRamp(ink);
    const lifted = softRamp(ink, { lift: 0.55, liftColor: '#5B698D' });
    expect(luminance(lifted[0])).toBeGreaterThan(luminance(plain[0]) * 2);
    expect(luminance(lifted[lifted.length - 1])).toBeGreaterThan(luminance(plain[plain.length - 1]) * 2);
  });

  it('clamps tone and interpolates between steps', () => {
    const ramp = softRamp(parseHex('#65A3DD') as Rgb);
    expect(rampAt(ramp, -1)).toEqual(ramp[0]);
    expect(rampAt(ramp, 2)).toEqual(ramp[ramp.length - 1]);
    expect(rampHexAt(ramp.map(hex), 0)).toBe(hex(ramp[0]));
  });
});

describe('sliceTone', () => {
  it('runs 0 at the front surface to 1 at the back of a z-slice stack', () => {
    const part = { depth: 12, thickness: 30 };
    expect(sliceTone(part, { axis: 'z', at: 6 } as never)).toBe(0);
    expect(sliceTone(part, { axis: 'z', at: -6 } as never)).toBe(1);
    expect(sliceTone(part, { axis: 'z', at: 0 } as never)).toBe(0.5);
    expect(sliceTone(part, { axis: 'x', at: 0 } as never)).toBe(1);
    expect(sliceTone(part, { axis: 'x', at: 15 } as never)).toBe(0);
  });
});

describe('softSprite (per-pixel soft-shape port)', () => {
  const ghost = HARK_ROSTER[0];

  it('is transparent outside the silhouette and opaque inside', () => {
    const s = softSprite(ghost.definition.body.path, parseHex(ghost.color) as Rgb, ghost.soft, 100);
    const at = (x: number, y: number) => s.data[(y * s.size + x) * 4 + 3];
    expect(at(1, 1)).toBe(0);
    expect(at(50, 45)).toBeGreaterThan(200);
  });

  it('lights the edge facing the key and sinks the far side', () => {
    const s = softSprite(ghost.definition.body.path, parseHex(ghost.color) as Rgb, ghost.soft, 100);
    const lum = (x: number, y: number) => {
      const o = (y * s.size + x) * 4;
      return 0.2126 * s.data[o] + 0.7152 * s.data[o + 1] + 0.0722 * s.data[o + 2];
    };
    expect(lum(50, 20)).toBeGreaterThan(lum(50, 75));
  });

  it('caches per outline + colour + material and stays deterministic', () => {
    const a = softSprite(ghost.definition.body.path, parseHex(ghost.color) as Rgb, ghost.soft, 100);
    const b = softSprite(ghost.definition.body.path, parseHex(ghost.color) as Rgb, ghost.soft, 100);
    expect(a).toBe(b);
    const c = softSprite(ghost.definition.body.path, parseHex('#FF4D00') as Rgb, ghost.soft, 100);
    expect(c).not.toBe(a);
    expect(c.data[50 * 100 * 4 + 50 * 4]).not.toBe(a.data[50 * 100 * 4 + 50 * 4]);
  });
});

describe('soft material in the renderers', () => {
  const ghost = getExample('ghost') ?? HARK_ROSTER[0].definition;

  it('is off by default and needs a hex colour', () => {
    expect(avatarFrame(ghost).ramp).toBeUndefined();
    expect(avatarFrame(ghost, { material: 'soft', color: 'var(--brand)' }).ramp).toBeUndefined();
    expect(avatarFrame(ghost, { material: 'soft', color: '#65A3DD' }).ramp?.length).toBeGreaterThan(1);
  });

  it('carries a front-facing soft body for the canvas renderer', () => {
    const opts = { material: 'soft' as const, color: '#65A3DD' };
    const frame = avatarFrame(ghost, opts);
    expect(frame.softBody?.d).toBe(ghost.body.path);
    const turned = avatarFrame(ghost, { ...opts, view: { yaw: 1.2, pitch: 0.5 } });
    expect(turned.softBody?.matrix).toEqual(frame.softBody?.matrix);
    expect(avatarFrame(ghost, { color: '#65A3DD' }).softBody).toBeUndefined();
  });

  it('tones every slice within 0..1 and marks at the surface', () => {
    const frame = avatarFrame(ghost, { material: 'soft', color: '#65A3DD', state: 'thinking', time: 1 });
    for (const s of frame.shapes) {
      if (s.kind !== 'slice') continue;
      expect(s.tone).toBeGreaterThanOrEqual(0);
      expect(s.tone).toBeLessThanOrEqual(1);
      if (s.key.startsWith('mark-')) expect(s.tone).toBe(0);
    }
  });

  it('paints SVG slices from the ramp, and leaves flat SVG untouched', () => {
    const soft = renderAvatarSvg(ghost, { material: 'soft', color: '#65A3DD' });
    const flat = renderAvatarSvg(ghost, { color: '#65A3DD' });
    expect((soft.match(/<use [^>]*fill="#/g) ?? []).length).toBeGreaterThan(0);
    expect(flat).not.toMatch(/<use [^>]*fill="/);
  });

  it('leaves the CSS 3D scene untouched: soft is a canvas-renderer feature', () => {
    const soft = renderAvatarScene(ghost, { depth: 6 });
    const flat = renderAvatarScene(ghost, { depth: 6 });
    expect(soft).toBe(flat);
    expect(sceneFrame(ghost, { material: 'soft', color: '#65A3DD' }).scene).toBe(sceneFrame(ghost, { color: '#65A3DD' }).scene);
  });

  it('keeps states and moods working with the material on', () => {
    for (const state of ['idle', 'thinking', 'working', 'waiting', 'blocked', 'done'] as const) {
      const frame = avatarFrame(ghost, { material: 'soft', color: '#FF4D00', state, stateAge: 1.2, time: 2 });
      expect(frame.ramp?.length).toBeGreaterThan(1);
      expect(frame.shapes.length).toBeGreaterThan(0);
    }
  });
});

describe('Hark roster', () => {
  it('validates every definition against the contract', () => {
    for (const bot of HARK_ROSTER) {
      const result = validateAvatar(bot.definition);
      expect(result.ok, bot.definition.id + ': ' + (result.ok ? '' : result.errors.join('; '))).toBe(true);
    }
  });

  it('is eight bots with eight distinct silhouettes and colours', () => {
    expect(HARK_ROSTER.length).toBe(8);
    expect(new Set(HARK_ROSTER.map((b) => b.definition.id)).size).toBe(8);
    expect(new Set(HARK_ROSTER.map((b) => b.definition.body.path)).size).toBe(8);
    expect(new Set(HARK_ROSTER.map((b) => b.color)).size).toBe(8);
  });

  it('uses only Hark sky stops and system accents, with valid skies', () => {
    const allowed = new Set<string>([...Object.values(HARK), ...Object.values(HARK_SKY).flat()]);
    for (const bot of HARK_ROSTER) {
      expect(allowed.has(bot.color), bot.color).toBe(true);
      expect(bot.sky.length).toBeGreaterThanOrEqual(2);
      for (const stop of bot.sky) expect(stop).toMatch(/^#[0-9A-F]{6}$/i);
    }
    for (const phase of Object.keys(HARK_SKY) as (keyof typeof HARK_SKY)[]) expect(harkSky(phase)).toEqual(HARK_SKY[phase]);
    expect(harkBot('ghost')?.role).toBe('Scout');
    expect(harkBot('nope')).toBeUndefined();
  });

  it('defaults stay backward compatible', () => {
    expect(DEFAULT_SOFT.lift).toBe(0);
    expect(avatarFrame(HARK_ROSTER[0].definition).ramp).toBeUndefined();
  });
});
