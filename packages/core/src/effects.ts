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
  /**
   * Which ribbon the piece belongs to, 0..8: band `ribbon / LANES`, lane `ribbon % LANES`. A
   * working bot shows the first band's three; a celebration adds the other two bands.
   */
  ribbon: number;
}

/**
 * The ribbons come in bands: LANES ribbons side by side on one tipped hoop round the body's
 * centre, running round it together like a brush stroke. Each band's hoop: how flat it looks
 * (how far it is tipped out of the screen), how far it is rolled in the picture, how far out it
 * sits and how long its lanes are. The first band is nearly level; the last two only join a
 * celebration (presence above 1), rolled about a third of a turn apart, so they cross the first
 * one into a cage.
 */
const BANDS = [
  { flat: 0.34, roll: 0.12, reach: 1, length: 2.45, extra: false },
  { flat: 0.36, roll: 1.16, reach: 1.16, length: 2.6, extra: true },
  { flat: 0.32, roll: 2.21, reach: 1.24, length: 2.3, extra: true },
] as const;
export const LANES = 3;
/**
 * Each lane of a band, from the inside of the hoop out: its share of the band's length and how
 * far its head trails the band's (radians), so the lanes do not start and end flush.
 */
const LANE_SHAPE = [
  { length: 0.84, lag: 0.13 },
  { length: 1, lag: 0 },
  { length: 0.9, lag: 0.07 },
] as const;
/** Lanes sit this many lane widths apart, centre to centre: a little less than one, so they touch. */
const LANE_GAP = 0.8;
const SAMPLES = 24;
/**
 * A celebration opens the cage up: every band stands this much further out (a share of its
 * radius) and its lanes are this much narrower, once all three bands are out.
 */
const CAGE_SPREAD = 0.14;
const CAGE_THIN = 0.16;
/** Points on each round end of a ribbon. */
const CAP = 7;

/**
 * For a body this size: the radius of the widest hoop, the width of one lane, and how far a band
 * reaches out from its hoop (its outer lane's centre plus half a lane).
 */
export function ribbonReach(b: Bounds): { radius: number; width: number; band: number } {
  const bw = b.maxX - b.minX, bh = b.maxY - b.minY;
  const width = clamp(Math.max(bw, bh) * 0.092, 3, 7.2);
  // No hoop is wider than the body's larger half, out at the farthest reach.
  const radius = (Math.max(bw, bh) / 2 * RIM + RIM_GAP) * Math.max(...BANDS.map((band) => band.reach)) * (1 + CAGE_SPREAD);
  return { radius, width, band: width * (LANE_GAP + 0.5) };
}

/**
 * A hoop's radius before its own reach: just off the body's rim along the direction it is rolled
 * to, half the body's width when level and half its height when upright. A level band hugs a
 * wide body instead of standing off its corners.
 */
function hoopRadius(b: Bounds, roll: number): number {
  const hw = (b.maxX - b.minX) / 2, hh = (b.maxY - b.minY) / 2;
  return Math.hypot(hw * Math.cos(roll), hh * Math.sin(roll)) * RIM + RIM_GAP;
}
/** How far off the rim a hoop stands: a share of the body's half size, and a little more. */
const RIM = 1.04;
const RIM_GAP = 0.6;

/**
 * The ribbons at one moment. Each band runs round its own hoop about the body's centre, its
 * lanes side by side: round at both ends, a little narrower at the tail than at the head, and
 * split where the hoop passes from behind the body to in front of it (the upper half is the near
 * side, so a band crosses in front of the body along its top). `presence` 0..1 draws the first
 * band out and back in; from 1 to 2 the other two join it. The bands only go round with `sweep`
 * (radians): they ride the body's turns, and stand where they are between them.
 */
export function ribbonPieces(b: Bounds, presence: number, seed: number, time: number, sweep = 0): RibbonPiece[] {
  const all = clamp(presence, 0, 2), more = clamp(all - 1, 0, 1);
  if (all <= 0.01) return [];
  const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
  const { width } = ribbonReach(b);
  const pieces: RibbonPiece[] = [];
  BANDS.forEach((band, i) => {
    const k = band.extra ? more : Math.min(all, 1);
    if (k <= 0.01) return;
    const r = hoopRadius(b, band.roll) * band.reach * (1 + CAGE_SPREAD * more);
    const lane = width * (1 - CAGE_THIN * more);
    const lead = noise(seed, 400 + i) * TAU + sweep;
    const reach = band.length * k * (1 + 0.2 * Math.sin(time * 1.1 + i * 2));
    const cr = Math.cos(band.roll), sr = Math.sin(band.roll);
    const place = (x: number, y: number): [number, number] => [cx + x * cr - y * sr, cy + x * sr + y * cr];
    LANE_SHAPE.forEach((shape, l) => {
      const offset = (l - (LANES - 1) / 2) * LANE_GAP * lane;
      const head = lead - shape.lag * k;
      const length = reach * shape.length;
      // Centre, half width, unit normal (on screen) and near side at each sample, tail to head.
      const mid: [number, number][] = [], halfs: number[] = [], norm: [number, number][] = [], near: boolean[] = [];
      for (let j = 0; j <= SAMPLES; j++) {
        const s = j / SAMPLES;
        const a = head - length * (1 - s);
        // On the hoop before its roll: the unit normal of the ellipse, and the lane's centre beside it.
        const nx = Math.cos(a) * band.flat, ny = Math.sin(a);
        const nl = Math.hypot(nx, ny) || 1;
        const ux = nx / nl, uy = ny / nl;
        mid.push(place(Math.cos(a) * r + ux * offset, Math.sin(a) * r * band.flat + uy * offset));
        norm.push([ux * cr - uy * sr, ux * sr + uy * cr]);
        halfs.push((lane / 2) * Math.sqrt(k) * (0.6 + 0.4 * s));
        near.push(Math.sin(a) < 0);
      }
      const side = (j: number, sign: number): [number, number] => [mid[j][0] + sign * norm[j][0] * halfs[j], mid[j][1] + sign * norm[j][1] * halfs[j]];
      // A half circle round an end, from one edge to the other through the point ahead of it (or behind).
      const cap = (j: number, ahead: boolean): [number, number][] => {
        const o = ahead ? mid[j - 1] : mid[j + 1];
        let tx = ahead ? mid[j][0] - o[0] : o[0] - mid[j][0], ty = ahead ? mid[j][1] - o[1] : o[1] - mid[j][1];
        const tl = Math.hypot(tx, ty) || 1;
        tx /= tl; ty /= tl;
        const [nx, ny] = norm[j], h = halfs[j], out: [number, number][] = [];
        for (let c = 1; c < CAP; c++) {
          const t = (Math.PI * c) / CAP;
          // Ahead: from the left edge (+normal) forward to the right; behind: from the right back to the left.
          const e = ahead ? Math.cos(t) : -Math.cos(t), g = ahead ? Math.sin(t) : -Math.sin(t);
          out.push([mid[j][0] + (nx * e + tx * g) * h, mid[j][1] + (ny * e + ty * g) * h]);
        }
        return out;
      };
      // Runs of samples on one side each become a piece; neighbours share the sample where they meet.
      let from = 0;
      for (let j = 1; j <= SAMPLES; j++) {
        if (j < SAMPLES && near[j] === near[from]) continue;
        const to = j;
        const pts: [number, number][] = [];
        for (let q = from; q <= to; q++) pts.push(side(q, 1));
        if (to === SAMPLES) pts.push(...cap(SAMPLES, true));
        for (let q = to; q >= from; q--) pts.push(side(q, -1));
        if (from === 0) pts.push(...cap(0, false));
        const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
        const x = Math.min(...xs), y = Math.min(...ys);
        pieces.push({
          d: `M${pts.map((p) => `${f(p[0])} ${f(p[1])}`).join('L')}Z`,
          front: near[from],
          box: { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y },
          ribbon: i * LANES + l,
        });
        from = j;
      }
    });
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
