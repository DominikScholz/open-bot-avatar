import { describe, expect, it } from 'vitest';
import { examples } from '../src/examples.ts';
import { flattenPath, parsePath } from '../src/path.ts';
import { avatarFrame, liveFrame, renderAvatarSvg } from '../src/render.ts';

const poses = [
  { time: 0, reducedMotion: true },
  { time: 1.3, motion: 'happy' as const },
  { time: 2.1, motion: 'thinking' as const, view: { yaw: 1.4, pitch: -0.3 } },
  { time: 0.4, gaze: { x: -0.8, y: 0.5 }, view: { yaw: -2.6, pitch: 0.6 } },
];

describe('avatarFrame', () => {
  it('holds exactly what the SVG still draws, in the same order', () => {
    for (const d of examples) {
      for (const o of poses) {
        const frame = avatarFrame(d, o);
        const svg = renderAvatarSvg(d, o);
        const uses = [...svg.matchAll(/<use href="#([^"]+)"/g)].map((m) => m[1]);
        expect(frame.shapes.filter((s) => s.kind === 'slice').map((s) => s.path)).toEqual(uses);
        expect(frame.shapes.filter((s) => s.kind === 'eye').length).toBe((svg.match(/<g transform=/g) ?? []).length - 1);
      }
    }
  });

  it('lists every path it references, once', () => {
    for (const d of examples) {
      const frame = avatarFrame(d, poses[2]);
      const ids = frame.paths.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const s of frame.shapes) if (s.kind === 'slice') expect(ids).toContain(s.path);
    }
  });

  it('gives each shape a key that is unique within a frame and means the same shape in every frame', () => {
    for (const d of examples) {
      const seen = new Map<string, string>();
      for (const o of poses) {
        const frame = avatarFrame(d, o);
        const keys = frame.shapes.map((s) => s.key);
        expect(new Set(keys).size).toBe(keys.length);
        for (const s of frame.shapes) {
          if (s.kind !== 'slice') continue;
          expect(seen.get(s.key) ?? s.path).toBe(s.path);
          seen.set(s.key, s.path);
        }
      }
    }
  });

  it('is plain data with finite numbers', () => {
    const frame = avatarFrame(examples[0], poses[1]);
    const copy = JSON.parse(JSON.stringify(frame));
    expect(copy).toEqual(frame);
    for (const s of frame.shapes) expect(s.matrix.every(Number.isFinite)).toBe(true);
    expect(frame.root.every(Number.isFinite)).toBe(true);
  });

  it('ignores size: custom renderers get every slice at any size', () => {
    for (const d of examples) {
      for (const o of poses) expect(avatarFrame(d, { ...o, size: 24 })).toEqual(avatarFrame(d, o));
    }
  });

  it('bounds every path with its box', () => {
    for (const d of examples) {
      for (const path of avatarFrame(d, poses[3]).paths) {
        // Curves are sampled: their control points may lie outside, the outline never does.
        for (const [x, y] of flattenPath(parsePath(path.d)).flat()) {
          expect(x).toBeGreaterThanOrEqual(path.box.x - 0.05);
          expect(x).toBeLessThanOrEqual(path.box.x + path.box.w + 0.05);
          expect(y).toBeGreaterThanOrEqual(path.box.y - 0.05);
          expect(y).toBeLessThanOrEqual(path.box.y + path.box.h + 0.05);
        }
      }
    }
  });
});

describe('liveFrame', () => {
  it('thins slices that would sit under a pixel apart, and only for small sizes', () => {
    for (const d of examples) {
      const all = avatarFrame(d, poses[0]).shapes.length;
      expect(liveFrame(d, { ...poses[0], size: 36 }).shapes.length).toBeLessThan(all);
      expect(liveFrame(d, { ...poses[0], size: 400 }).shapes.length).toBeGreaterThan(liveFrame(d, { ...poses[0], size: 36 }).shapes.length);
      expect(liveFrame(d, poses[0])).toEqual(avatarFrame(d, poses[0]));
    }
  });
});

