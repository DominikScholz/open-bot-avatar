import { describe, expect, it } from 'vitest';
import { outlineModel } from '../src/dom/fluffy/marks.ts';
import { parsePath, PathError } from '../src/path.ts';

/** A question mark's hook about its own centre, sized in `u` (as a host's mark would draw it). */
const hook = (u: number) => {
  const arc = (r: number, large: 0 | 1, sweep: 0 | 1, x: number, y: number) => `A${r * u} ${r * u} 0 ${large} ${sweep} ${x * u} ${y * u}`;
  return `M${-0.26 * u} ${-0.062 * u}` + arc(0.26, 1, 1, 0.13, 0.163) + arc(0.08, 0, 0, 0.09, 0.232) + arc(0.09, 0, 1, -0.09, 0.232) +
    arc(0.26, 0, 1, 0.04, 0.007) + arc(0.08, 1, 0, -0.08, -0.062) + arc(0.09, 0, 1, -0.26, -0.062) + 'Z';
};
const box = (u: number) => ({ x: -0.26 * u, y: -0.3225 * u, w: 0.52 * u, h: 0.645 * u });

describe('a mark\'s outline in fluffy', () => {
  it('is parsed about its own centre, where a body\'s path would be out of bounds', () => {
    expect(() => parsePath('M-60 -60H60V60H-60Z')).toThrow(PathError);
    expect(parsePath('M-60 -60H60V60H-60Z', false).length).toBe(5);
  });

  it('becomes a volume in its own shape, with a stroke as wide as a capsule\'s', () => {
    const model = outlineModel(hook(60), box(60))!;
    expect(model).not.toBeNull();
    const [part] = model.volume.parts;
    expect(model.volume.parts.length).toBe(1);
    // The hook's stroke is 0.18 of its unit; in the model it is about a capsule's 24 units.
    expect(part.thickness).toBeGreaterThan(20);
    expect(part.thickness).toBeLessThan(28);
    // Centred in the 100-unit box, inside it, and not a disc: the hook's hollow is empty.
    const b = model.volume.bounds;
    expect((b.minX + b.maxX) / 2).toBeCloseTo(50, 0);
    expect((b.minY + b.maxY) / 2).toBeCloseTo(50, 0);
    expect(Math.max(b.maxX - b.minX, b.maxY - b.minY)).toBeLessThanOrEqual(84.1);
    expect(part.height(50, b.minY + 1.5)).toBeGreaterThan(0);
    expect(part.height(b.minX + 12 * (b.maxX - b.minX) / 52, 50 + 20)).toBe(0);
    // Model units per unit of the outline, and where its centre is.
    expect(model.cx).toBeCloseTo(0);
    expect(model.scale * 0.52 * 60).toBeCloseTo(b.maxX - b.minX, 0);
  });

  it('is one model at any size, so avatars of different sizes share it', () => {
    const a = outlineModel(hook(40), box(40))!, b = outlineModel(hook(70), box(70))!;
    expect(a.key).toBe(b.key);
    expect(a.volume).toBe(b.volume);
    expect(a.scale / b.scale).toBeCloseTo(70 / 40);
  });

  it('is null for an outline no volume can be built from', () => {
    expect(outlineModel('M0 0L10 0Z', { x: 0, y: 0, w: 10, h: 0 })).toBeNull();
    expect(outlineModel('not a path', { x: 0, y: 0, w: 10, h: 10 })).toBeNull();
  });
});
