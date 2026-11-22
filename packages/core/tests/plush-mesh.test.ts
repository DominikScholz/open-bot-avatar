import { describe, expect, it } from 'vitest';
import { buildMesh, type Capsule } from '../src/dom/plush/mesh.ts';
import { getExample } from '../src/examples.ts';
import { preparedVolume } from '../src/render.ts';

const vec = (a: Float32Array, i: number, stride: number, offset = 0) => [a[i * stride + offset], a[i * stride + offset + 1], a[i * stride + offset + 2]];

describe('plush mesh', () => {
  const { vol } = preparedVolume(getExample('mug')!);
  const mesh = buildMesh(vol);

  it('wraps the whole body in triangles with unit normals', () => {
    const count = mesh.vertices.length / 6;
    expect(mesh.indices.length % 3).toBe(0);
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

  it('refines the front around the eyes, and nowhere else', () => {
    // Smallest triangle each vertex belongs to, by where the vertex is.
    const area = (t: number) => {
      const [a, b, c] = [0, 1, 2].map((k) => vec(mesh.vertices, mesh.indices[3 * t + k], 6));
      const u = b.map((v, k) => v - a[k]), w = c.map((v, k) => v - a[k]);
      return Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]) / 2;
    };
    const eye = vol.eyePlanes[0];
    let atEye = Infinity, onBack = Infinity;
    for (let t = 0; t < mesh.indices.length / 3; t++) {
      const [x, y, z] = vec(mesh.vertices, mesh.indices[3 * t], 6);
      if (z > 0 && Math.hypot(x - eye.x, y - eye.y) < 2) atEye = Math.min(atEye, area(t));
      if (z < -2 && Math.hypot(x - eye.x, y - eye.y) < 2) onBack = Math.min(onBack, area(t));
    }
    expect(atEye).toBeLessThan(onBack / 4);
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

  it('shapes a state mark as a capsule', () => {
    const capsule: Capsule = { radius: 12, bounds: { minX: -12, maxX: 12, minY: -30, maxY: 30 } };
    const { vertices } = buildMesh(capsule);
    for (let i = 0; i < vertices.length / 6; i += 13) {
      const [x, y, z] = vec(vertices, i, 6);
      // Distance from the capsule's axis, a segment from y = -18 to 18.
      expect(Math.hypot(x, Math.max(0, Math.abs(y) - 18), z)).toBeCloseTo(12, 0);
    }
  });
});
