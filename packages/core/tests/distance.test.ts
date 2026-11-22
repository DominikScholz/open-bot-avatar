/**
 * The volume build's fast paths must return exactly what the plain definitions do: the same
 * numbers, bit for bit, so not a pixel of a rendered avatar depends on which one ran. Each test
 * here checks one of them against its definition on the starters and the gallery.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contourLoops, contourOutlines, runRange, runsOf, simplifyLoop } from '../src/contour.ts';
import { EdgeIndex } from '../src/distance.ts';
import { rimOf } from '../src/effects.ts';
import { examples } from '../src/examples.ts';
import { bounds, edgeBands, insideRow, winding } from '../src/path.ts';
import type { Point } from '../src/path.ts';
import { ribbonRims } from '../src/render.ts';
import { analyzeBody } from '../src/validate.ts';
import { buildVolume, edgeDistance } from '../src/volume.ts';
import type { AvatarDefinition } from '../src/types.ts';

const dir = 'gallery';
const gallery: AvatarDefinition[] = existsSync(dir)
  ? readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'colors.json').sort().map((f) => JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')))
  : [];
const all = [...examples, ...gallery];
/** Each avatar's whole outline, and each of its subpaths on its own. */
const outlines = all.flatMap((def) => {
  const body = analyzeBody(def.body.path);
  return [{ id: def.id, polys: body.polys }, ...body.subpaths.map((s, k) => ({ id: `${def.id}/${k}`, polys: s.polys }))];
});

// Long slanted edges that cross the whole body, over and over: each passes through many buckets.
outlines.push({ id: 'zigzag', polys: [Array.from({ length: 60 }, (_, k): Point => [k % 2 ? 88 - k / 3 : 12 + k / 3, 10 + (k * 80) / 59])] });

/** Points that land on the outline (its corners, the middles of its edges, rows and columns through its bounds) and off it. */
function probes(polys: Point[][]): Point[] {
  const b = bounds(polys), out: Point[] = [];
  for (const poly of polys) {
    for (let i = 0; i < poly.length; i += 7) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      out.push(p, [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], [p[0] + 0.3, p[1]], [p[0], p[1] - 0.2]);
    }
  }
  for (let y = b.minY - 1; y <= b.maxY + 1; y += 2.5) for (let x = b.minX - 1; x <= b.maxX + 1; x += 2.5) out.push([x, y]);
  for (let y = b.minY + 0.37; y < b.maxY; y += 3.1) for (let x = b.minX + 0.21; x < b.maxX; x += 2.9) out.push([x, y]);
  return out;
}

describe('banded edges', () => {
  it('count the same winding as a pass over every edge, on the outline and off it', () => {
    for (const { id, polys } of outlines) {
      const index = edgeBands(polys);
      for (const [x, y] of probes(polys)) {
        if (index.winding(x, y) !== winding(polys, x, y)) expect.fail(`${id}: winding differs at (${x}, ${y})`);
      }
    }
  });

  it('flag the same points of a row as insideRow, one by one and together', () => {
    for (const { id, polys } of outlines) {
      const index = edgeBands(polys), b = bounds(polys);
      // Rows through the bounds and through corners, with points on vertical edges among them.
      const ys = [b.minY, b.maxY, b.minY - 1, (b.minY + b.maxY) / 2, ...polys[0].filter((_, k) => k % 11 === 0).map((p) => p[1])];
      const xs = Array.from({ length: Math.ceil((b.maxX - b.minX + 2) / 0.5) + 1 }, (_, i) => b.minX - 1 + i * 0.5);
      const plain = new Uint8Array(xs.length), fast = new Uint8Array(xs.length);
      for (const y of ys) {
        insideRow(polys, y, xs, plain);
        index.insideRow(y, xs, fast);
        expect(Array.from(fast), `${id} row ${y}`).toEqual(Array.from(plain));
        for (let k = 0; k < xs.length; k += 5) expect(index.insideRowAt(xs[k], y), `${id} (${xs[k]}, ${y})`).toBe(plain[k] === 1);
      }
    }
  });
});

describe('edge index', () => {
  it('measures a point exactly as a pass over every edge does', () => {
    for (const { id, polys } of outlines) {
      const index = new EdgeIndex(polys, bounds(polys));
      for (const [x, y] of probes(polys)) {
        if (index.distance(x, y) !== edgeDistance(polys, x, y)) expect.fail(`${id}: distance differs at (${x}, ${y})`);
      }
      // Far outside the buckets too.
      expect(index.distance(-300, 410), id).toBe(edgeDistance(polys, -300, 410));
    }
  });

  it('fills a grid with those distances, and finds the widest inside sample without filling it', () => {
    for (const { id, polys } of outlines) {
      const b = bounds(polys), index = new EdgeIndex(polys, b), rows = edgeBands(polys);
      for (const step of [0.9, 1.7]) {
        const g = { x0: b.minX - 1, y0: b.minY - 1, step, nx: Math.ceil((b.maxX - b.minX + 2) / step) + 1, ny: Math.ceil((b.maxY - b.minY + 2) / step) + 1 };
        const fast = index.distances(g);
        const xs = Array.from({ length: g.nx }, (_, i) => g.x0 + i * step), inside = new Uint8Array(g.nx);
        let widest = 0;
        for (let j = 0; j < g.ny; j++) {
          const y = g.y0 + j * step;
          insideRow(polys, y, xs, inside);
          for (let i = 0; i < g.nx; i++) {
            const d = edgeDistance(polys, xs[i], y);
            if (fast[j * g.nx + i] !== d) expect.fail(`${id}: grid distance differs at sample ${i}, ${j} (step ${step})`);
            if (inside[i]) widest = Math.max(widest, d);
          }
        }
        expect(index.widest(g, rows), `${id} step ${step}`).toBe(widest);
      }
    }
  });

  it('gives a part the height its outline and surface define, at any point', () => {
    for (const def of examples) {
      for (const part of buildVolume(def).parts) {
        for (const [x, y] of probes(part.polys).filter((_, k) => k % 3 === 0)) {
          const inside = winding(part.polys, x, y) !== 0;
          if (!inside) expect(part.height(x, y), def.id).toBe(0);
          else if (part.kind === 'inflate') {
            // The fillet of surfaceZ at the point's distance from the outline.
            const dist = edgeDistance(part.polys, x, y), half = part.depth / 2;
            const k = 1 - Math.max(0, dist) / part.rxy;
            expect(part.height(x, y), def.id).toBe(dist >= part.rxy ? half : half - part.rz + Math.sqrt(Math.max(0, 1 - k * k)) * part.rz);
          }
        }
      }
    }
  });
});

describe('traced outlines', () => {
  /** A ring with a wavy rim on a grid, so its contours have curves, corners and a hole. */
  const field = (nx: number, ny: number) => {
    const values = new Float64Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const r = Math.hypot(i - nx / 2, j - ny / 2), a = Math.atan2(j - ny / 2, i - nx / 2);
      values[j * nx + i] = Math.min(r - 7, 0.38 * nx + 2.5 * Math.sin(5 * a) - r);
    }
    return { values, nx, ny, x0: 3, y0: -2, step: 0.45 };
  };

  it('are the contour loops, each simplified, without the ones that collapse', () => {
    for (const [nx, ny] of [[61, 61], [90, 47], [17, 23]]) {
      const f = field(nx, ny);
      for (const level of [0, 1.3, 4, 9.5, -2]) {
        const plain = contourLoops(f, level).map((l) => simplifyLoop(l, 0.04)).filter((l) => l.length >= 3);
        expect(contourOutlines(f, level, 0.04), `${nx}x${ny} at ${level}`).toEqual(plain);
        // Runs of cells that cannot cross the level are skipped without changing a point.
        const range = runRange(f.values, nx, ny), flat = new Uint8Array(runsOf(nx) * (ny - 1));
        for (let k = 0; k < flat.length; k++) flat[k] = range.min[k] - level >= 0 || range.max[k] - level < 0 ? 1 : 0;
        expect(flat.some((v) => v === 1)).toBe(true);
        expect(contourOutlines(f, level, 0.04, flat)).toEqual(plain);
        expect(contourLoops(f, level, flat)).toEqual(contourLoops(f, level));
      }
    }
  });

  it('simplify a loop as Ramer-Douglas-Peucker with Math.hypot does, ties included', () => {
    /** The algorithm as written out in full: every distance through Math.hypot. */
    const reference = (loop: Point[], tolerance: number): Point[] => {
      if (loop.length <= 8) return loop;
      let far = 0, best = -1;
      for (let k = 1; k < loop.length; k++) {
        const d = Math.hypot(loop[k][0] - loop[0][0], loop[k][1] - loop[0][1]);
        if (d > best) { best = d; far = k; }
      }
      const keep = new Uint8Array(loop.length);
      keep[0] = keep[far] = 1;
      const stack: [number, number][] = [[0, far], [far, loop.length]];
      while (stack.length) {
        const [s, e] = stack.pop()!;
        const a = loop[s], b = loop[e % loop.length];
        const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
        let idx = -1, max = tolerance;
        for (let k = s + 1; k < e; k++) {
          const p = loop[k];
          const d = len === 0 ? Math.hypot(p[0] - a[0], p[1] - a[1]) : Math.abs(dx * (a[1] - p[1]) - dy * (a[0] - p[0])) / len;
          if (d > max) { max = d; idx = k; }
        }
        if (idx >= 0) { keep[idx] = 1; stack.push([s, idx], [idx, e]); }
      }
      return loop.filter((_, k) => keep[k]);
    };
    const loops: Point[][] = contourLoops(field(61, 61), 1.3);
    // Mirror images tie exactly; so do the points of a square and of a loop that returns on itself.
    const half: Point[] = Array.from({ length: 40 }, (_, k) => [3 + 2 * Math.sin(k / 3) + k / 9, k * 0.45]);
    loops.push([...half, ...half.map(([u, y]): Point => [-u, y]).reverse()]);
    loops.push(Array.from({ length: 36 }, (_, k): Point => (k < 9 ? [k, 0] : k < 18 ? [9, k - 9] : k < 27 ? [27 - k, 9] : [0, 36 - k])));
    loops.push([...half, ...half.slice().reverse()]);
    loops.push(Array.from({ length: 12 }, (): Point => [5, 5]));
    for (const part of buildVolume(examples[0]).parts) for (const s of part.xSlices.slice(0, 6)) loops.push(...s.loops);
    for (const loop of loops) {
      for (const tolerance of [0.04, 0.3, 0]) expect(simplifyLoop(loop, tolerance)).toEqual(reference(loop, tolerance));
    }
  });
});

describe('ribbon rims', () => {
  it('reach as far along any direction as testing every edge finds', () => {
    /** The reach as defined: the farthest crossing of the line through the centre with any edge. */
    const reference = (outlines: Point[][][], cx: number, cy: number, a: number) => {
      const ux = Math.cos(a), uy = Math.sin(a);
      let far = 0;
      for (const poly of outlines.flat()) {
        for (let i = 0; i < poly.length; i++) {
          const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
          const ex = x2 - x1, ey = y2 - y1, den = ux * ey - uy * ex;
          if (Math.abs(den) < 1e-12) continue;
          const t = ((x1 - cx) * ey - (y1 - cy) * ex) / den, s = ((x1 - cx) * uy - (y1 - cy) * ux) / den;
          if (s >= 0 && s <= 1) far = Math.max(far, Math.abs(t));
        }
      }
      return far;
    };
    const angles = [0, Math.PI / 2, Math.PI, -Math.PI / 2, 7.3, -11.9, 1e-9, Math.PI - 1e-9, -1e-20, 1e20, -3.7e15, NaN, Infinity, ...Array.from({ length: 60 }, (_, k) => (k * Math.PI) / 180 * 3), ...Array.from({ length: 40 }, (_, k) => 0.1234 + k * 0.777)];
    for (const def of all) {
      const body = analyzeBody(def.body.path), b = body.bounds;
      // The body itself about the middle of its box, about one of its own corners, and the rims the renderer builds.
      const [px, py] = body.polys[0][0];
      for (const [cx, cy] of [[(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2], [px, py], [b.minX - 5, b.maxY + 3]]) {
        const rim = rimOf([body.polys], cx, cy);
        for (const a of angles) {
          if (rim.at(a) !== reference([body.polys], cx, cy, a)) expect.fail(`${def.id}: reach differs along ${a} from (${cx}, ${cy})`);
        }
        expect(rim.max, def.id).toBe(Math.max(...Array.from({ length: 180 }, (_, k) => reference([body.polys], cx, cy, (k * Math.PI) / 180))) * 1.02);
      }
      const { work, cage } = ribbonRims(body.polys, b);
      expect(work.max, def.id).toBeGreaterThan(0);
      expect(cage.max, def.id).toBeGreaterThanOrEqual(work.at(0) * 0.5);
    }
  });
});
