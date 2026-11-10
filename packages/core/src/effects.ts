/**
 * What a state draws besides the body: the ribbons that circle a working bot, and the marks a
 * thinking or blocked bot turns into (three dots, an exclamation mark). Pure geometry in viewBox
 * units, from the body's bounds, a seed and the animation clock.
 */
import { noise } from './motion.ts';
import type { Bounds } from './path.ts';

const TAU = Math.PI * 2;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smooth = (u: number) => { const x = clamp(u, 0, 1); return x * x * (3 - 2 * x); };
const f = (n: number) => {
  const r = Math.round(n * 100) / 100;
  return (Object.is(r, -0) ? 0 : r).toString();
};

export interface Box { x: number; y: number; w: number; h: number }

// ---------------------------------------------------------------------------
// Ribbons

/** One piece of a ribbon: the part of it in front of the body, or the part behind. */
export interface RibbonPiece {
  d: string;
  front: boolean;
  box: Box;
}

/** Each ribbon's hoop: how flat it looks, how far it is rolled, how fast it runs, how long it is. */
const HOOPS = [
  { flat: 0.26, roll: -0.7, period: 1.55, reach: 1, length: 2.3 },
  { flat: 0.2, roll: 0.5, period: 1.9, reach: 1.06, length: 1.9 },
  { flat: 0.3, roll: 1.3, period: 1.3, reach: 1.12, length: 1.6 },
] as const;
const SAMPLES = 24;

/** Radius of the widest hoop and the widest a ribbon gets, for a body this size. */
export function ribbonReach(b: Bounds): { radius: number; width: number } {
  const bw = b.maxX - b.minX, bh = b.maxY - b.minY;
  // Wide enough that a rolled hoop still clears the body's corners.
  return { radius: Math.hypot(bw, bh) / 2 + 1, width: clamp(Math.max(bw, bh) * 0.045, 1.6, 3.6) };
}

/**
 * The ribbons at one moment. Each one runs round its own tilted hoop about the body's centre:
 * thin at the tail, full near the head, and split where the hoop passes from behind the body to
 * in front of it (the lower half is the near side). `presence` 0..1 draws them out and back in.
 */
export function ribbonPieces(b: Bounds, presence: number, seed: number, time: number): RibbonPiece[] {
  const k = clamp(presence, 0, 1);
  if (k <= 0.01) return [];
  const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
  const { radius, width } = ribbonReach(b);
  const pieces: RibbonPiece[] = [];
  HOOPS.forEach((hoop, i) => {
    const r = (radius * hoop.reach) / HOOPS[HOOPS.length - 1].reach;
    const head = noise(seed, 400 + i) * TAU + (TAU * time) / hoop.period;
    const length = hoop.length * k * (1 + 0.25 * Math.sin(time * 1.1 + i * 2));
    const cr = Math.cos(hoop.roll), sr = Math.sin(hoop.roll);
    // Both edges of the ribbon at each sample, tail to head, and which side of the body it is on.
    const left: [number, number][] = [], right: [number, number][] = [], near: boolean[] = [];
    for (let j = 0; j <= SAMPLES; j++) {
      const s = j / SAMPLES;
      const a = head - length * (1 - s);
      const half = (width / 2) * k * Math.pow(s, 0.7) * Math.sqrt(clamp((1 - s) / 0.12, 0, 1));
      // On the hoop before its roll: position, and the unit normal of the ellipse there.
      const ex = Math.cos(a) * r, ey = Math.sin(a) * r * hoop.flat;
      const nx = Math.cos(a) * hoop.flat, ny = Math.sin(a);
      const nl = Math.hypot(nx, ny) || 1;
      const place = (x: number, y: number): [number, number] => [cx + x * cr - y * sr, cy + x * sr + y * cr];
      left.push(place(ex + (nx / nl) * half, ey + (ny / nl) * half));
      right.push(place(ex - (nx / nl) * half, ey - (ny / nl) * half));
      near.push(Math.sin(a) > 0);
    }
    // Runs of samples on one side each become a piece; neighbours share the sample where they meet.
    let from = 0;
    for (let j = 1; j <= SAMPLES; j++) {
      if (j < SAMPLES && near[j] === near[from]) continue;
      const to = j < SAMPLES ? j : SAMPLES;
      const pts = [...left.slice(from, to + 1), ...right.slice(from, to + 1).reverse()];
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      const x = Math.min(...xs), y = Math.min(...ys);
      pieces.push({
        d: `M${pts.map((p) => `${f(p[0])} ${f(p[1])}`).join('L')}Z`,
        front: near[from],
        box: { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y },
      });
      from = j;
    }
  });
  return pieces;
}

// ---------------------------------------------------------------------------
// Marks

/** One part of a mark: a fixed outline about its own centre, and where that centre is this frame. */
export interface MarkPart {
  /** Stable name of the outline, e.g. "dot". */
  shape: string;
  d: string;
  box: Box;
  /** Centre, viewBox units, then a rotation about the mark's centre (radians) and a scale about the part's own. */
  x: number;
  y: number;
  turn: number;
  scale: number;
}

const circle = (r: number) => `M${f(r)} 0A${f(r)} ${f(r)} 0 1 1 ${f(-r)} 0A${f(r)} ${f(r)} 0 1 1 ${f(r)} 0Z`;
const capsule = (w: number, h: number) => {
  const r = w / 2, y = h / 2 - r;
  return `M${f(-r)} ${f(-y)}A${f(r)} ${f(r)} 0 0 1 ${f(r)} ${f(-y)}L${f(r)} ${f(y)}A${f(r)} ${f(r)} 0 0 1 ${f(-r)} ${f(y)}Z`;
};

/** The unit every mark is sized in: a share of the body's smaller side, within limits that read at any size. */
function markUnit(b: Bounds): number {
  return clamp(Math.min(b.maxX - b.minX, b.maxY - b.minY), 34, 78);
}

/**
 * The parts of the marks at one moment. `bang` and `dots` 0..1 are how far the body has given
 * way to each (see Pose): a mark grows in as the body goes, from the body's centre.
 * The dots take turns hopping; the exclamation mark jumps and shakes every couple of seconds.
 */
export function markParts(b: Bounds, bang: number, dots: number, seed: number, time: number, still: boolean): MarkPart[] {
  const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
  const u = markUnit(b);
  const t = still ? 0 : time + noise(seed, 9) * 10;
  const parts: MarkPart[] = [];
  // A mark starts to grow just before the body is gone, so something is always on screen.
  const grown = (weight: number) => smooth((clamp(weight, 0, 1) - 0.45) / 0.55);

  const gb = grown(bang);
  if (gb > 0) {
    const barW = 0.21 * u, barH = 0.5 * u, dot = 0.115 * u, gap = 0.1 * u;
    const total = barH + gap + 2 * dot;
    // One alarm every 2.6 s: a jump, with a shake that dies away as it lands.
    const p = still ? 1 : ((t % 2.6) + 2.6) % 2.6 / 2.6;
    const alarm = p < 0.3 ? p / 0.3 : 1;
    const jump = still ? 0 : Math.sin(Math.PI * alarm);
    const turn = still ? 0 : 0.2 * Math.sin(TAU * 3 * alarm) * (1 - alarm);
    const lift = -0.09 * u * jump;
    const barY = -total / 2 + barH / 2, dotY = total / 2 - dot;
    // The dot lags the bar on the way up, so the mark stretches as it jumps.
    parts.push(
      { shape: 'bar', d: capsule(barW, barH), box: { x: -barW / 2, y: -barH / 2, w: barW, h: barH }, x: cx, y: cy + (barY + lift) * gb, turn, scale: gb },
      { shape: 'dot', d: circle(dot), box: { x: -dot, y: -dot, w: 2 * dot, h: 2 * dot }, x: cx, y: cy + (dotY + lift * 0.45) * gb, turn, scale: gb },
    );
  }

  const gd = grown(dots);
  if (gd > 0) {
    const r = 0.1 * u, step = 0.31 * u;
    for (let i = 0; i < 3; i++) {
      // Each dot hops in turn, a beat after the one before it.
      const p = still ? 0 : (((t - i * 0.17) % 1.25) + 1.25) % 1.25 / 1.25;
      const hop = p < 0.4 ? Math.sin(Math.PI * (p / 0.4)) : 0;
      parts.push({
        shape: 'dot3', d: circle(r), box: { x: -r, y: -r, w: 2 * r, h: 2 * r },
        x: cx + (i - 1) * step * gd, y: cy - 0.16 * u * hop * gd, turn: 0, scale: gd * (1 + 0.12 * hop),
      });
    }
  }
  return parts;
}

/** How much of its size the body keeps while it gives way to a mark: gone a little past half way. */
export function bodyScale(bang: number, dots: number): number {
  return 1 - smooth(clamp(bang + dots, 0, 1) / 0.55);
}
