/**
 * The fluffy texture: every cross-section's outline grown into soft tufts.
 *
 * Fur is geometry, like the rest of the body: each loop of a cross-section is cut into tufts of
 * about TUFT_SPACING along its length, and each tuft rises from its base and curls over to a soft
 * tip about TUFT_HEIGHT out. Tufts only grow outward from the fill, so the eyes keep their room.
 * Every renderer draws the result as it draws any slice: one flat color, no filters.
 *
 * A body is a stack of cross-sections, and seen at an angle their outlines lie side by side. Tufts
 * placed on each on its own would interleave into noise, so a slice takes its tuft bases from its
 * neighbor's (see furLayout): the nearest points on its own outline, thinned where they crowd and
 * filled in where they spread. Tufts line up through the stack and read as one furry outline.
 *
 * `lean` (-1..1) bends every tip sideways in its plane, for the sway: the renderer picks one of a
 * few SWAY_LEVELS so a swaying avatar reuses a small set of paths.
 */
import { noise } from './motion.ts';
import type { Point } from './path.ts';
import type { AvatarTexture } from './types.ts';

export type { AvatarTexture };
export const TEXTURES: readonly AvatarTexture[] = ['smooth', 'fluffy'];
export const isTexture = (v: unknown): v is AvatarTexture => v === 'smooth' || v === 'fluffy';

/** Average distance between neighboring tuft bases along an outline, viewBox units. */
export const TUFT_SPACING = 5;
/** Average height of a tuft's tip over its base, viewBox units. */
export const TUFT_HEIGHT = 2.4;
/** How far along its base a tuft's tip curls over, as a share of the base. */
const CURL = 0.3;
/** How steeply a tuft rises from its base (control point height, as a share of the tuft's). */
const SHOULDER = 0.9;
/** How round a tip is, as a share of the base. */
const ROUND = 0.15;
/**
 * Front cross-sections further inside the outline than this stay smooth. Seen at an angle the
 * stack's slices shift along the silhouette's top and bottom edges, and fur on every one of them
 * would fill in each other's gaps; the outline and walls carry the fur.
 */
export const FUR_INSET = 1;
/** Distinct sway leans on each side of upright; a swaying avatar draws one of 2 × SWAY_LEVELS + 1. */
export const SWAY_LEVELS = 3;
/** How far a full lean moves a tip sideways, as a share of the tuft's height. */
const LEAN = 0.45;
/** Tallest tuft (heights vary from 0.75 to 1.25 × TUFT_HEIGHT): how far fur stands out from the outline. */
export const FUR_HEIGHT = TUFT_HEIGHT * 1.25;
/** Spread of a tuft's curl around CURL, as a share of its base. */
const CURL_JITTER = 0.25;
/** Longest tuft base: spacing jittered by a quarter either side, or a gap just short of being filled. */
const MAX_BASE = 2 * TUFT_SPACING;
/**
 * Furthest any point of a fur path, control points included, lies outside the plain outline's box:
 * the tallest tuft leaning fully sideways, and a tip's control point curling past its base's end at
 * a corner. The renderers' bounds allow for it.
 */
export const FUR_REACH = FUR_HEIGHT * (1 + LEAN) + Math.max(0, CURL + CURL_JITTER / 2 + ROUND - 0.5) * MAX_BASE;
/** Loops shorter than this keep their plain outline (a speck has no room for fur). */
const MIN_PERIMETER = 2 * TUFT_SPACING;

/** Snap a sway amount (-1..1) to its level. */
export function swayLevel(sway: number): number {
  const s = Math.max(-1, Math.min(1, Number.isFinite(sway) ? sway : 0));
  return Math.round(s * SWAY_LEVELS);
}

/** A tuft base: where it sits, and an id its size and tilt are drawn from, kept as it passes slice to slice. */
export interface FurBase {
  p: Point;
  id: number;
}

interface FurLoop {
  /** Outlines wind with positive area, holes with negative. */
  pts: Point[];
  /** Tuft bases in order along the loop; empty for a loop too small for fur. */
  bases: FurBase[];
}

/** Where a cross-section's tufts sit. Pass its `bases` to the next slice in the stack. */
export interface FurLayout {
  loops: FurLoop[];
  bases: FurBase[];
}

function area(loop: Point[]): number {
  let s = 0;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) s += loop[j][0] * loop[i][1] - loop[i][0] * loop[j][1];
  return s / 2;
}

function contains(loop: Point[], [x, y]: Point): boolean {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const [xi, yi] = loop[i], [xj, yj] = loop[j];
    if ((yi > y) !== (yj > y) && x < xj + ((y - yj) * (xi - xj)) / (yi - yj)) inside = !inside;
  }
  return inside;
}

/** Cumulative length along a closed loop, and the point at a length. */
function measure(pts: Point[]) {
  const n = pts.length;
  const cum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % n];
    cum[i + 1] = cum[i] + Math.hypot(bx - ax, by - ay);
  }
  const at = (s: number): Point => {
    const len = cum[n];
    s = ((s % len) + len) % len;
    let lo = 0, hi = n;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= s) lo = mid; else hi = mid;
    }
    const t = cum[lo + 1] > cum[lo] ? (s - cum[lo]) / (cum[lo + 1] - cum[lo]) : 0;
    const [ax, ay] = pts[lo], [bx, by] = pts[(lo + 1) % n];
    return [ax + (bx - ax) * t, ay + (by - ay) * t];
  };
  /** Nearest point on the loop: its distance and its length along the loop. */
  const nearest = ([x, y]: Point): { dist: number; s: number } => {
    let best = Infinity, s = 0;
    for (let i = 0; i < n; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % n];
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
      const d = (ax + t * dx - x) ** 2 + (ay + t * dy - y) ** 2;
      if (d < best) { best = d; s = cum[i] + t * (cum[i + 1] - cum[i]); }
    }
    return { dist: Math.sqrt(best), s };
  };
  return { cum, perimeter: cum[n], at, nearest };
}

/**
 * Tuft bases for a cross-section's loops (any winding, evenodd nesting). Without `anchors` each
 * loop is cut evenly from its topmost point; with them (the bases of the neighboring slice in the
 * same plane) each loop takes the nearest points to them, thinned and filled to about TUFT_SPACING.
 */
export function furLayout(loops: Point[][], anchors: FurBase[] | null = null): FurLayout {
  const shaped = loops.flatMap((loop, li) => {
    if (loop.length < 3) return [];
    // A loop inside an odd number of others is a hole: its fill lies outside it.
    const hole = loops.reduce((n, other, k) => (k !== li && other.length >= 3 && contains(other, loop[0]) ? n + 1 : n), 0) % 2 === 1;
    const run = (area(loop) > 0) !== hole ? loop : [...loop].reverse();
    let top = 0;
    for (let i = 1; i < run.length; i++) if (run[i][1] < run[top][1] - 1e-9 || (Math.abs(run[i][1] - run[top][1]) <= 1e-9 && run[i][0] < run[top][0])) top = i;
    const pts = [...run.slice(top), ...run.slice(0, top)];
    return [{ pts, m: measure(pts), li }];
  });
  // Each anchor goes to the loop nearest it, if any is near: a part of the outline gone in this slice drops its tufts.
  const claimed: { s: number; id: number }[][] = shaped.map(() => []);
  if (anchors) {
    for (const a of anchors) {
      let best = -1, near = { dist: Infinity, s: 0 };
      shaped.forEach((l, k) => {
        const hit = l.m.nearest(a.p);
        if (hit.dist < near.dist) { near = hit; best = k; }
      });
      if (best >= 0 && near.dist < 2 * TUFT_SPACING) claimed[best].push({ s: near.s, id: a.id });
    }
  }
  const out: FurLoop[] = shaped.map(({ pts, m, li }, k) => {
    const P = m.perimeter;
    if (P < MIN_PERIMETER) return { pts, bases: [] };
    let marks = claimed[k].sort((a, b) => a.s - b.s);
    // Thin: a base too close to the one before it goes (the wrap included).
    const kept: { s: number; id: number }[] = [];
    for (const b of marks) if (!kept.length || b.s - kept[kept.length - 1].s >= 0.55 * TUFT_SPACING) kept.push(b);
    if (kept.length > 1 && kept[0].s + P - kept[kept.length - 1].s < 0.55 * TUFT_SPACING) kept.pop();
    marks = kept;
    if (marks.length < 3) {
      // Nothing to follow: cut evenly from the top, jittered by id.
      const count = Math.max(4, Math.round(P / TUFT_SPACING));
      marks = Array.from({ length: count }, (_, j) => {
        const id = (li + 1) * 100003 + j;
        return { s: ((j + (j ? (noise(id, 10) - 0.5) * 0.5 : 0)) / count) * P, id };
      });
    } else {
      // Fill: a gap much wider than the spacing gets new bases spread evenly across it.
      const filled: { s: number; id: number }[] = [];
      marks.forEach((b, j) => {
        filled.push(b);
        const next = j + 1 < marks.length ? marks[j + 1].s : marks[0].s + P;
        const gap = next - b.s, extra = Math.round(gap / TUFT_SPACING) - 1;
        for (let q = 1; q <= extra && gap > 1.6 * TUFT_SPACING; q++) {
          filled.push({ s: b.s + (gap * q) / (extra + 1), id: (Math.imul(b.id, 31) + q * 7 + 1) >>> 0 });
        }
      });
      marks = filled;
    }
    return { pts, bases: marks.map((b) => ({ p: m.at(b.s), id: b.id })) };
  });
  return { loops: out, bases: out.flatMap((l) => l.bases) };
}

/** Writes a path in tenths of a unit with relative commands, rounding carried so it never drifts. */
class PathWriter {
  d = '';
  private x = 0;
  private y = 0;
  minX = Infinity; minY = Infinity; maxX = -Infinity; maxY = -Infinity;

  private static num(t: number): string {
    const a = Math.abs(t), s = a % 10 === 0 ? `${a / 10}` : a < 10 ? `.${a}` : `${Math.floor(a / 10)}.${a % 10}`;
    return t < 0 ? `-${s}` : s;
  }

  private nums(ts: number[]): string {
    let out = '';
    for (const t of ts) {
      const s = PathWriter.num(t);
      // A separator is only needed where the next number could be read as part of the last one.
      if (out && s[0] !== '-' && !(s[0] === '.' && /\.\d*$/.test(out))) out += ' ';
      out += s;
    }
    return out;
  }

  private snap([px, py]: Point): [number, number] {
    if (px < this.minX) this.minX = px;
    if (py < this.minY) this.minY = py;
    if (px > this.maxX) this.maxX = px;
    if (py > this.maxY) this.maxY = py;
    return [Math.round(px * 10), Math.round(py * 10)];
  }

  move(p: Point) {
    const [x, y] = this.snap(p);
    this.d += `M${this.nums([x, y])}`;
    this.x = x; this.y = y;
  }

  curve(c1: Point, c2: Point, p: Point) {
    const a = this.snap(c1), b = this.snap(c2), e = this.snap(p);
    this.d += `c${this.nums([a[0] - this.x, a[1] - this.y, b[0] - this.x, b[1] - this.y, e[0] - this.x, e[1] - this.y])}`;
    this.x = e[0]; this.y = e[1];
  }

  line(p: Point) {
    const e = this.snap(p);
    this.d += `l${this.nums([e[0] - this.x, e[1] - this.y])}`;
    this.x = e[0]; this.y = e[1];
  }

  close() { this.d += 'z'; }
}

export interface FurPath {
  /** Nonzero fill rule: outlines and holes wind opposite ways, and overlapping tufts stay filled. */
  d: string;
  box: { x: number; y: number; w: number; h: number };
}

/** Draw a layout's tufts. `lean` (-1..1) bends their tips toward +x in the plane's own coordinates. */
export function furPath(layout: FurLayout, lean = 0): FurPath {
  const out = new PathWriter();
  for (const { pts, bases } of layout.loops) {
    if (!bases.length) {
      out.move(pts[0]);
      for (let i = 1; i < pts.length; i++) out.line(pts[i]);
      out.close();
      continue;
    }
    out.move(bases[0].p);
    for (let k = 0; k < bases.length; k++) {
      const a = bases[k].p, b = bases[(k + 1) % bases.length].p, id = bases[k].id;
      const cx = b[0] - a[0], cy = b[1] - a[1], len = Math.hypot(cx, cy);
      if (len < 1e-6) continue;
      // With positive area the right-hand normal (dy, -dx) points out of the fill, holes included.
      const tx = cx / len, ty = cy / len, nx = ty, ny = -tx;
      const h = Math.min(TUFT_HEIGHT * (0.75 + 0.5 * noise(id, 200)), FUR_HEIGHT, 0.8 * len);
      const curl = (CURL + (noise(id, 400) - 0.5) * CURL_JITTER) * len;
      const sway = lean * LEAN * h;
      const tip: Point = [(a[0] + b[0]) / 2 + nx * h + tx * curl + sway, (a[1] + b[1]) / 2 + ny * h + ty * curl];
      const shoulder = SHOULDER * h, round = ROUND * len;
      out.curve([a[0] + nx * shoulder, a[1] + ny * shoulder], [tip[0] - tx * round, tip[1] - ty * round], tip);
      out.curve([tip[0] + tx * round, tip[1] + ty * round], [b[0] + nx * shoulder * 0.4, b[1] + ny * shoulder * 0.4], b);
    }
    out.close();
  }
  const box = out.minX <= out.maxX
    ? { x: out.minX, y: out.minY, w: out.maxX - out.minX, h: out.maxY - out.minY }
    : { x: 0, y: 0, w: 0, h: 0 };
  return { d: out.d, box };
}
