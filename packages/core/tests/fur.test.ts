import { describe, expect, it } from 'vitest';
import { framePlacement } from '../src/dom/paint.ts';
import { examples, getExample } from '../src/examples.ts';
import { FUR_REACH, SWAY_LEVELS, TUFT_HEIGHT, furLayout, furPath, swayLevel } from '../src/fur.ts';
import { winding, type Point } from '../src/path.ts';
import { avatarExtent, avatarFrame, preparedVolume, renderAvatarScene, renderAvatarSvg, sceneFrame } from '../src/render.ts';
import type { AvatarDefinition, RenderOptions } from '../src/types.ts';

/** Polygons of a fur path (M, relative c and l, z), each cubic sampled along its length. */
function polygons(d: string): Point[][] {
  const t = d.match(/[Mclz]|-?(?:\d+\.?\d*|\.\d+)/g) ?? [];
  const polys: Point[][] = [];
  let i = 0, x = 0, y = 0, cmd = '';
  const n = () => Number(t[i++]);
  while (i < t.length) {
    if (/[Mclz]/.test(t[i])) cmd = t[i++];
    if (cmd === 'z') continue;
    if (cmd === 'M') {
      x = n(); y = n();
      polys.push([[x, y]]);
    } else if (cmd === 'l') {
      x += n(); y += n();
      polys[polys.length - 1].push([x, y]);
    } else {
      const [x1, y1, x2, y2, ex, ey] = [n() + x, n() + y, n() + x, n() + y, n() + x, n() + y];
      for (let k = 1; k <= 8; k++) {
        const s = k / 8, u = 1 - s;
        polys[polys.length - 1].push([
          u * u * u * x + 3 * u * u * s * x1 + 3 * u * s * s * x2 + s * s * s * ex,
          u * u * u * y + 3 * u * u * s * y1 + 3 * u * s * s * y2 + s * s * s * ey,
        ]);
      }
      x = ex; y = ey;
    }
  }
  return polys;
}

const holds = (outer: { x: number; y: number; size: number }, b: { x0: number; y0: number; x1: number; y1: number }) =>
  b.x0 >= outer.x && b.y0 >= outer.y && b.x1 <= outer.x + outer.size && b.y1 <= outer.y + outer.size;

const core = (d: AvatarDefinition, part = 0) => preparedVolume(d).vol.parts[part].zSlices.find((s) => s.at === 0)!;

describe('fluffy texture', () => {
  it('leaves smooth avatars exactly as they were, and falls back to smooth for unknown values', () => {
    for (const d of examples) {
      const plain = renderAvatarSvg(d, { time: 1.1 });
      expect(renderAvatarSvg(d, { time: 1.1, texture: 'smooth' })).toBe(plain);
      expect(renderAvatarSvg(d, { time: 1.1, texture: 'woolly' as never })).toBe(plain);
      expect(renderAvatarSvg(d, { time: 1.1, texture: 'fluffy' })).not.toBe(plain);
    }
  });

  it('grows tufts outward only: the plain fill stays filled, holes stay open, and fur reaches no further than FUR_REACH', () => {
    const mug = getExample('mug')!;
    for (const d of examples) {
      const slice = core(d);
      const fur = polygons(furPath(furLayout(slice.loops), 1).d);
      // Points just inside the plain outline are still filled; points well outside it are not.
      for (const loop of slice.loops) {
        for (let k = 0; k < loop.length; k += 5) {
          const [x, y] = loop[k], [nx, ny] = loop[(k + 1) % loop.length];
          const len = Math.hypot(nx - x, ny - y) || 1;
          // A step to either side of the edge: whichever lands in the plain fill must be in the fur too.
          for (const side of [1, -1]) {
            const px = (x + nx) / 2 + (side * -(ny - y) * 0.3) / len, py = (y + ny) / 2 + (side * (nx - x) * 0.3) / len;
            if (winding(slice.loops, px, py) !== 0) expect(winding(fur, px, py), `${d.id} at ${px},${py}`).not.toBe(0);
          }
        }
      }
      const box = slice.box, furBox = furPath(furLayout(slice.loops), 1).box;
      expect(furBox.x).toBeGreaterThanOrEqual(box.x - FUR_REACH);
      expect(furBox.y).toBeGreaterThanOrEqual(box.y - FUR_REACH);
      expect(furBox.x + furBox.w).toBeLessThanOrEqual(box.x + box.w + FUR_REACH);
      expect(furBox.y + furBox.h).toBeLessThanOrEqual(box.y + box.h + FUR_REACH);
      // The fur actually stands out past the plain outline somewhere.
      expect(Math.max(box.x - furBox.x, furBox.x + furBox.w - box.x - box.w, box.y - furBox.y)).toBeGreaterThan(TUFT_HEIGHT / 2);
    }
    // The mug's handle hole: its middle is open in the plain body and stays open with fur.
    const fur = polygons(furPath(furLayout(core(mug, 1).loops)).d);
    expect(winding(core(mug, 1).loops, 74, 53)).toBe(0);
    expect(winding(fur, 74, 53)).toBe(0);
  });

  it('draws the same eyes as the smooth avatar', () => {
    for (const d of examples) {
      for (const o of [{ reducedMotion: true }, { time: 0.6, mood: 'happy' as const }, { time: 2, view: { yaw: 0.8, pitch: -0.2 } }]) {
        const eyes = (texture: 'smooth' | 'fluffy') => avatarFrame(d, { ...o, texture }).shapes.filter((s) => s.kind === 'eye');
        expect(eyes('fluffy')).toEqual(eyes('smooth'));
      }
    }
  });

  it('keeps every frame inside its extent, ribbons and sway included', () => {
    for (const d of examples) {
      for (const depth of [0, 6, 14]) {
        const extent = avatarExtent(d, depth, 'fluffy');
        const poses: RenderOptions[] = [
          { reducedMotion: true, view: { yaw: 0.9, pitch: -0.5 } },
          { state: 'working', stateAge: 1.5, time: 1.5 },
          { state: 'done', stateAge: 0.8, time: 0.8 },
          { time: 3.7, gaze: { x: 1, y: -1 }, view: { yaw: -2.6, pitch: 0.6 } },
        ];
        for (const o of poses) {
          const { bounds } = framePlacement(avatarFrame(d, { ...o, depth, texture: 'fluffy' }));
          expect(holds(extent, bounds)).toBe(true);
        }
      }
    }
  });

  it('sways through several leans over time, stands upright under reduced motion, and is deterministic', () => {
    const d = examples[0];
    const leans = (o: RenderOptions) =>
      new Set(avatarFrame(d, { ...o, texture: 'fluffy' }).paths.map((p) => p.id.match(/-f(\d+)$/)?.[1]).filter(Boolean));
    const seen = new Set<string | undefined>();
    for (let t = 0; t < 8; t += 0.25) for (const l of leans({ time: t })) seen.add(l);
    expect(seen.size).toBeGreaterThanOrEqual(3);
    for (const t of [0, 1.7, 4.2]) expect([...leans({ time: t, reducedMotion: true })]).toEqual([String(SWAY_LEVELS)]);
    expect(avatarFrame(d, { time: 2.3, texture: 'fluffy' })).toEqual(avatarFrame(d, { time: 2.3, texture: 'fluffy' }));
    expect(swayLevel(-5)).toBe(-SWAY_LEVELS);
    expect(swayLevel(Number.NaN)).toBe(0);
  });

  it('builds a separate scene for the fluffy texture', () => {
    const c = getExample('controller')!;
    const smooth = renderAvatarScene(c), fluffy = renderAvatarScene(c, { texture: 'fluffy' });
    const id = (html: string) => html.match(/data-avatar-scene="([^"]+)"/)?.[1];
    expect(id(fluffy)).not.toBe(id(smooth));
    expect(sceneFrame(c, { texture: 'fluffy', time: 1 }).scene).toBe(id(fluffy));
    expect(sceneFrame(c, { time: 1 }).scene).toBe(id(smooth));
    expect(fluffy).not.toMatch(/NaN|undefined|Infinity/);
  });
});
