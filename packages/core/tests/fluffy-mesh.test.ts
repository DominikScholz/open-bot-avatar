import { describe, expect, it } from 'vitest';
import { ROOT_PASSES, buildMesh, rootsIn, type Capsule } from '../src/dom/fluffy/mesh.ts';
import { fluffyDetail } from '../src/dom/fluffy/renderer.ts';
import { getExample } from '../src/examples.ts';
import { preparedVolume } from '../src/render.ts';

const vec = (a: Float32Array, i: number, stride: number, offset = 0) => [a[i * stride + offset], a[i * stride + offset + 1], a[i * stride + offset + 2]];

describe('fluffy mesh', () => {
  const { vol } = preparedVolume(getExample('mug')!);
  const mesh = buildMesh(vol);

  it('wraps the whole body in triangles with unit normals', () => {
    const count = mesh.vertices.length / 6;
    expect(mesh.indices.length).toBe(mesh.coarse.count + mesh.fine.count);
    expect(mesh.fine.count % 3).toBe(0);
    expect(mesh.indices.every((i) => i < count)).toBe(true);
    for (let i = 0; i < count; i += 97) expect(Math.hypot(...vec(mesh.vertices, i, 6, 3))).toBeCloseTo(1, 3);
    // Front and back, out to the handle and as deep as the body.
    const depth = Math.max(...vol.parts.map((part) => part.depth));
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < count; i++) {
      const [x, , z] = vec(mesh.vertices, i, 6);
      minX = Math.min(minX, x), maxX = Math.max(maxX, x), minZ = Math.min(minZ, z), maxZ = Math.max(maxZ, z);
    }
    expect(minX).toBeCloseTo(vol.bounds.minX, 0);
    expect(maxX).toBeCloseTo(vol.bounds.maxX, 0);
    expect(maxZ).toBeCloseTo(depth / 2, 0);
    expect(minZ).toBeCloseTo(-depth / 2, 0);
  });

  it('refines the front around the eyes, and nowhere else, next to the unrefined triangles', () => {
    const fine = mesh.indices.subarray(mesh.fine.start, mesh.fine.start + mesh.fine.count);
    const area = (t: number) => {
      const [a, b, c] = [0, 1, 2].map((k) => vec(mesh.vertices, fine[3 * t + k], 6));
      const u = b.map((v, k) => v - a[k]), w = c.map((v, k) => v - a[k]);
      return Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]) / 2;
    };
    const eye = vol.eyePlanes[0];
    let atEye = Infinity, onBack = Infinity;
    for (let t = 0; t < fine.length / 3; t++) {
      const [x, y, z] = vec(mesh.vertices, fine[3 * t], 6);
      if (z > 0 && Math.hypot(x - eye.x, y - eye.y) < 2) atEye = Math.min(atEye, area(t));
      if (z < -2 && Math.hypot(x - eye.x, y - eye.y) < 2) onBack = Math.min(onBack, area(t));
    }
    expect(atEye).toBeLessThan(onBack / 4);
    // The coarse set covers the same surface with fewer triangles and only the grid's vertices.
    const coarse = mesh.indices.subarray(mesh.coarse.start, mesh.coarse.start + mesh.coarse.count);
    expect(mesh.coarse.count).toBeLessThan(mesh.fine.count / 2);
    expect(Math.max(...coarse)).toBeLessThan(Math.max(...fine));
  });

  it('roots hairs all over the surface, the same ones every time', () => {
    const roots = mesh.roots.length / 8;
    expect(roots).toBeGreaterThan(20000);
    for (let i = 0; i < roots; i += 211) {
      expect(Math.hypot(...vec(mesh.roots, i, 8, 3))).toBeCloseTo(1, 1);
      expect(mesh.roots[i * 8 + 6]).toBeGreaterThanOrEqual(0);
      expect(mesh.roots[i * 8 + 7]).toBeLessThan(1);
    }
    expect(buildMesh(vol).roots).toEqual(mesh.roots);
  });

  it('stores the roots in passes that each cover the whole surface', () => {
    const total = mesh.roots.length / 8;
    expect(rootsIn(total, ROOT_PASSES)).toBe(total);
    expect(rootsIn(total, 0)).toBe(0);
    const quarter = rootsIn(total, ROOT_PASSES / 4);
    expect(quarter / total).toBeCloseTo(0.25, 3);
    // A quarter of the roots reaches every side of the body, like all of them.
    const reach = (count: number) => {
      const b = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
      for (let i = 0; i < count; i++) {
        const [x, y, z] = vec(mesh.roots, i, 8);
        b.minX = Math.min(b.minX, x), b.maxX = Math.max(b.maxX, x), b.minY = Math.min(b.minY, y);
        b.maxY = Math.max(b.maxY, y), b.minZ = Math.min(b.minZ, z), b.maxZ = Math.max(b.maxZ, z);
      }
      return Object.values(b);
    };
    reach(quarter).forEach((edge, i) => expect(edge).toBeCloseTo(reach(total)[i], 0));
  });

  it('shapes a state mark as a capsule', () => {
    const capsule: Capsule = { radius: 12, bounds: { minX: -12, maxX: 12, minY: -30, maxY: 30 } };
    const { vertices, coarse, fine } = buildMesh(capsule);
    expect(fine).toEqual(coarse);
    for (let i = 0; i < vertices.length / 6; i += 13) {
      const [x, y, z] = vec(vertices, i, 6);
      // Distance from the capsule's axis, a segment from y = -18 to 18.
      expect(Math.hypot(x, Math.max(0, Math.abs(y) - 18), z)).toBeCloseTo(12, 0);
    }
  });
});

describe('fluffy detail', () => {
  it('draws everything from 128 CSS pixels on a 2× display, and less below', () => {
    const full = { shells: 5, strandPasses: ROOT_PASSES, fineSockets: true };
    expect(fluffyDetail(2.56)).toEqual(full);
    expect(fluffyDetail(8)).toEqual(full);
    // 64 CSS pixels at 2×, or 128 at 1×.
    expect(fluffyDetail(1.28)).toEqual({ shells: 3, strandPasses: 6, fineSockets: false });
    expect(fluffyDetail(0.1)).toEqual({ shells: 2, strandPasses: ROOT_PASSES / 4, fineSockets: false });
  });

  it('never draws more as an avatar gets smaller', () => {
    let last = fluffyDetail(3);
    for (let scale = 3; scale > 0.1; scale -= 0.05) {
      const detail = fluffyDetail(scale);
      expect(detail.shells).toBeLessThanOrEqual(last.shells);
      expect(detail.strandPasses).toBeLessThanOrEqual(last.strandPasses);
      expect(Number(detail.fineSockets)).toBeLessThanOrEqual(Number(last.fineSockets));
      last = detail;
    }
  });
});
