import { describe, expect, it } from 'vitest';
import { FIT_PAD, FIT_SLACK, fitSquare, framePlacement, type Bounds, type Square } from '../src/dom/paint.ts';
import { examples } from '../src/examples.ts';
import { flattenPath, type Segment } from '../src/path.ts';
import { MOTIONS } from '../src/motion.ts';
import { avatarExtent, avatarFrame, liveFrame } from '../src/render.ts';
import type { RenderOptions } from '../src/types.ts';

/** Rendered paths are absolute and may sit past the 0..100 box parsePath accepts. */
function segments(d: string): Segment[] {
  const t = d.match(/[MLCQAZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
  const out: Segment[] = [];
  let i = 0, c = 'M';
  const n = () => Number(t[i++]);
  while (i < t.length) {
    if (/[A-Z]/.test(t[i])) c = t[i++];
    if (c === 'Z') out.push({ c: 'Z' });
    else if (c === 'M' || c === 'L') out.push({ c, x: n(), y: n() });
    else if (c === 'C') out.push({ c, x1: n(), y1: n(), x2: n(), y2: n(), x: n(), y: n() });
    else if (c === 'Q') out.push({ c, x1: n(), y1: n(), x: n(), y: n() });
    else out.push({ c: 'A', rx: n(), ry: n(), rot: n(), large: n() as 0 | 1, sweep: n() as 0 | 1, x: n(), y: n() });
  }
  return out;
}

const holds = (s: Square, b: Bounds, pad = FIT_PAD) =>
  b.x0 - pad >= s.x - 1e-9 && b.y0 - pad >= s.y - 1e-9 && b.x1 + pad <= s.x + s.size + 1e-9 && b.y1 + pad <= s.y + s.size + 1e-9;

const flattened = new Map<string, number[]>();

/** Every corner of every polyline vertex and eye shape, placed: what the canvas actually paints. */
function painted(o: RenderOptions, d = examples[0]) {
  const frame = avatarFrame(d, o);
  const { matrices, bounds } = framePlacement(frame);
  const paths = new Map(frame.paths.map((p) => [p.id, p.d]));
  const flat = (d: string) => {
    let pts = flattened.get(d);
    if (!pts) flattened.set(d, (pts = flattenPath(segments(d)).flat(2)));
    return pts;
  };
  const points: [number, number][] = [];
  frame.shapes.forEach((s, i) => {
    const m = matrices[i];
    const local: number[] = s.kind === 'slice' ? flat(paths.get(s.path) ?? '')
      : (s.mark.d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    for (let k = 0; k < local.length; k += 2) points.push([m[0] * local[k] + m[2] * local[k + 1] + m[4], m[1] * local[k] + m[3] * local[k + 1] + m[5]]);
  });
  return { bounds, points };
}

const poses: RenderOptions[] = [];
for (const motion of MOTIONS) {
  for (let t = 0; t < 12; t++) {
    poses.push({ motion, time: t * 0.61, gaze: t % 3 ? { x: Math.sin(t), y: Math.cos(t * 1.3) } : undefined });
    poses.push({ motion, time: t * 0.37, view: { yaw: t * 0.9 - 5, pitch: Math.sin(t) * 1.4 } });
  }
}

describe('framePlacement', () => {
  it('bounds everything a frame paints, to well within the antialiasing pad', () => {
    let overshoot = 0;
    for (const d of examples) {
      for (const o of poses.slice(0, 18)) {
        const { bounds, points } = painted(o, d);
        for (const [x, y] of points) overshoot = Math.max(overshoot, bounds.x0 - x, x - bounds.x1, bounds.y0 - y, y - bounds.y1);
      }
    }
    expect(overshoot).toBeLessThan(0.05);
  });
});

describe('fitSquare', () => {
  const cap = { x: -40, y: -40, size: 180 };

  it('lays out a frame with slack, then keeps that square while frames stay inside it', () => {
    const b = { x0: 10, y0: 20, x1: 90, y1: 70 };
    const first = fitSquare(null, b, cap);
    expect(first.size).toBe(80 + 2 * FIT_SLACK);
    expect(holds(first, b, FIT_SLACK - 1e-9)).toBe(true);
    expect(fitSquare(first, { x0: 12, y0: 22, x1: 88, y1: 72 }, cap)).toBe(first);
  });

  it('grows to hold a frame that leaves it, keeping what it held', () => {
    const first = fitSquare(null, { x0: 10, y0: 10, x1: 90, y1: 90 }, cap);
    const next = fitSquare(first, { x0: 0, y0: 10, x1: 100, y1: 90 }, cap);
    expect(next).not.toBe(first);
    expect(holds(next, { x0: first.x, y0: first.y, x1: first.x + first.size, y1: first.y + first.size }, 0)).toBe(true);
    expect(holds(next, { x0: 0, y0: 10, x1: 100, y1: 90 })).toBe(true);
  });

  it('never exceeds the cap for frames inside it, and keeps the previous square when nothing is painted', () => {
    expect(fitSquare(null, { x0: -35, y0: -35, x1: 135, y1: 135 }, cap)).toBe(cap);
    const prev = { x: 0, y: 0, size: 100 };
    expect(fitSquare(prev, { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }, cap)).toBe(prev);
  });

  it('holds every frame of a running avatar, settles, and stays far below the extent', () => {
    for (const d of examples) {
      const extent = avatarExtent(d);
      let fit: Square | null = null, grows = 0;
      for (let t = 0; t < 400; t++) {
        const o: RenderOptions = { motion: (['idle', 'happy', 'sad'] as const)[Math.floor(t / 40) % 3], time: t / 30, gaze: { x: Math.sin(t / 17), y: Math.cos(t / 23) }, size: 64 };
        const { bounds } = framePlacement(liveFrame(d, o));
        const next = fitSquare(fit, bounds, extent);
        if (next !== fit) grows++;
        fit = next;
        expect(holds(fit, bounds)).toBe(true);
      }
      expect(grows).toBeLessThanOrEqual(4);
      expect((fit as Square).size ** 2).toBeLessThan(0.55 * extent.size ** 2);
    }
  });

  it('holds frames at any view and depth within the extent', () => {
    for (const d of examples) {
      for (const depth of [0, 6, 14]) {
        const extent = avatarExtent(d, depth);
        for (const o of poses) {
          const { bounds } = framePlacement(avatarFrame(d, { ...o, depth }));
          expect(holds(extent, bounds, 0)).toBe(true);
          expect(holds(fitSquare(null, bounds, extent), bounds)).toBe(true);
        }
      }
    }
  });
});
