import { describe, expect, it } from 'vitest';
import { ROOT_PASSES, STEP, buildMesh, rootsIn, type Capsule, type FluffyMesh } from '../src/dom/fluffy/mesh.ts';
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

  /** How many of a mesh's unrefined triangles face along their vertices' normals. */
  const outward = (m: FluffyMesh) => {
    let count = 0;
    for (let t = m.coarse.start; t < m.coarse.start + m.coarse.count; t += 3) {
      const [a, b, c] = [0, 1, 2].map((k) => vec(m.vertices, m.indices[t + k], 6));
      const n = [0, 1, 2].map((k) => vec(m.vertices, m.indices[t + k], 6, 3)).reduce((sum, v) => sum.map((x, k) => x + v[k]));
      const u = b.map((v, k) => v - a[k]), w = c.map((v, k) => v - a[k]);
      const face = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      if (face[0] * n[0] + face[1] * n[1] + face[2] * n[2] > 0) count++;
    }
    return count;
  };

  it('winds every triangle the same way seen from outside, so back faces can be culled', () => {
    // All one way, but for the few slivers whose corners' normals disagree with their face.
    const triangles = mesh.coarse.count / 3, out = outward(mesh);
    expect(Math.min(out, triangles - out)).toBeLessThan(triangles / 200);
  });

  it('merges down to fewer triangles on the same surface, with the same roots', () => {
    const merged = buildMesh(vol, { cell: 2 });
    expect(merged.coarse.count).toBeLessThan(mesh.coarse.count / 3);
    expect(merged.fine.count).toBeGreaterThan(merged.coarse.count);
    expect(merged.roots).toEqual(mesh.roots);
    const triangles = merged.coarse.count / 3, out = outward(merged);
    expect(Math.min(out, triangles - out)).toBeLessThan(triangles / 100);
    // The same way round as the full mesh.
    expect(out > triangles / 2).toBe(outward(mesh) > mesh.coarse.count / 6);
    // Still out to the handle, front and back.
    const depth = Math.max(...vol.parts.map((part) => part.depth));
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i <= Math.max(...merged.indices.subarray(0, merged.coarse.count)); i++) {
      const [x, , z] = vec(merged.vertices, i, 6);
      minX = Math.min(minX, x), maxX = Math.max(maxX, x), minZ = Math.min(minZ, z), maxZ = Math.max(maxZ, z);
    }
    expect(minX).toBeCloseTo(vol.bounds.minX, 0);
    expect(maxX).toBeCloseTo(vol.bounds.maxX, 0);
    expect(maxZ).toBeCloseTo(depth / 2, 0);
    expect(minZ).toBeCloseTo(-depth / 2, 0);
  });

  it('builds a second mesh of a shape without sockets or roots when asked', () => {
    const plain = buildMesh(vol, { cell: 3, sockets: false, roots: false });
    expect(plain.fine).toEqual(plain.coarse);
    expect(plain.roots.length).toBe(0);
    expect(buildMesh(vol, { cell: STEP }).indices).toEqual(mesh.indices);
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
    // Merged vertices are put back on the surface, closer than the grid's own vertices sit.
    const merged = buildMesh(capsule, { cell: 3 });
    expect(merged.vertices.length).toBeLessThan(vertices.length / 4);
    for (let i = 0; i < merged.vertices.length / 6; i++) {
      const [x, y, z] = vec(merged.vertices, i, 6);
      expect(Math.abs(Math.hypot(x, Math.max(0, Math.abs(y) - 18), z) - 12)).toBeLessThan(0.1);
    }
  });
});

describe('fluffy detail', () => {
  it('draws everything above 128 CSS pixels on a 2× display, and less from there down', () => {
    const full = { shells: 5, drawnShells: 5, strandPasses: ROOT_PASSES, fineSockets: true, cell: STEP, fewerReads: false };
    expect(fluffyDetail(8)).toEqual(full);
    // Everything but the empty outermost shell, from a mesh of wider cells.
    expect(fluffyDetail(2.56)).toEqual({ ...full, drawnShells: 4, cell: 2 });
    // 64 CSS pixels at 2×, or 128 at 1×.
    expect(fluffyDetail(1.28)).toEqual({ shells: 3, drawnShells: 2, strandPasses: 6, fineSockets: false, cell: 2, fewerReads: true });
    expect(fluffyDetail(0.1)).toEqual({ shells: 2, drawnShells: 1, strandPasses: ROOT_PASSES / 4, fineSockets: false, cell: 3, fewerReads: true });
  });

  it('never draws more as an avatar gets smaller', () => {
    let last = fluffyDetail(6);
    for (let scale = 6; scale > 0.1; scale -= 0.05) {
      const detail = fluffyDetail(scale);
      expect(detail.shells).toBeLessThanOrEqual(last.shells);
      expect(detail.drawnShells).toBeLessThanOrEqual(last.drawnShells);
      expect(detail.cell).toBeGreaterThanOrEqual(last.cell);
      expect(Number(detail.fewerReads)).toBeGreaterThanOrEqual(Number(last.fewerReads));
      expect(detail.strandPasses).toBeLessThanOrEqual(last.strandPasses);
      expect(Number(detail.fineSockets)).toBeLessThanOrEqual(Number(last.fineSockets));
      last = detail;
    }
  });
});
