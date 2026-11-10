/**
 * Renderers for a validated silhouette + eye placement with implied volume
 * (see volume.ts). One flat body color, two plain dark eyes; no gradients,
 * gloss, rim light or shadows. Output is built only from numbers and the
 * renderer's own markup.
 *
 * - avatarFrame: one frame flattened to plain data (paths, matrices, eyes),
 *   for any vector renderer.
 * - renderAvatarSvg: a standalone still, serialized from avatarFrame. Cross-sections of the stack that
 *   faces the viewer are projected orthographically and painted back to front.
 * - renderAvatarScene + sceneFrame: a CSS 3D scene. Every cross-section is its
 *   own small SVG placed once with a 3D transform; animating, turning and
 *   recoloring only change a few CSS transforms, and the browser's compositor
 *   does projection and occlusion. Each visible slice costs a compositor layer,
 *   so mountAvatar paints live avatars to one canvas by default and only uses
 *   the scene with `renderer: 'scene'`.
 */
import { parseHex, toHex } from './color.ts';
import type { Rgb } from './color.ts';
import { computePose, hashString } from './motion.ts';
import type { Pose } from './motion.ts';
import type { Bounds, Point } from './path.ts';
import { EYE_H, EYE_W, GAZE_X, GAZE_Y, HAPPY_ARC, analyzeBody, eyeCenters, gazeRange, validateAvatar } from './validate.ts';
import type { GazeRange } from './validate.ts';
import { buildVolume, spanAt } from './volume.ts';
import type { Volume, VolumeSlice } from './volume.ts';
import type { AvatarDefinition, AvatarMotion, RenderOptions } from './types.ts';

const MOTIONS: readonly AvatarMotion[] = ['idle', 'working', 'waiting', 'blocked', 'thinking', 'done', 'happy'];

export const DEFAULT_COLOR = '#ff6a1a';
export const DEFAULT_EYE_COLOR = '#151515';
/** `depth` option value that maps to the natural inferred volume. */
export const DEFAULT_DEPTH = 6;
const MAX_DEPTH = 14;
/**
 * Eyes sit this far above the surface so they never touch the body planes. iOS WebKit treats planes
 * closer than about a pixel as one and may draw the body over an eye (0.3 did: a band of the
 * barbell's bar through one eye), so the gap is a few pixels at the stage's size. Turned, an eye
 * drifts lift × sin(angle) from its spot: under half a unit at rest, about one at 45°.
 */
const EYE_LIFT = 1.5;
/** Flat (bored) eyes: this much wider than a neutral eye, and this fraction as tall. */
const FLAT_WIDTH = 2.2;
const FLAT_OPEN = 0.42;

interface Prepared {
  def: AvatarDefinition;
  vol: Volume;
  range: GazeRange;
  seed: number;
  /** Prefix for SVG ids; equal geometry and depth always give equal ids, so repeats on a page are safe. */
  id: string;
  /** Stable SVG id per distinct cross-section path, assigned once. */
  ids: Map<string, string>;
  /** Slices kept at a rendered size, per stack, keyed by stack and rounded size. */
  detail: Map<string, boolean[]>;
}

const cache = new Map<string, Prepared>();

const f = (n: number) => {
  const r = Math.round(n * 100) / 100;
  return (Object.is(r, -0) ? 0 : r).toString();
};
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function depthOption(options: RenderOptions): number {
  const d = clamp(Number.isFinite(options.depth) ? (options.depth as number) : DEFAULT_DEPTH, 0, MAX_DEPTH);
  return Math.round(d * 2) / 2;
}

function prepare(definition: AvatarDefinition, depth: number): Prepared {
  const key = JSON.stringify([definition?.id, definition?.name, definition?.body?.path, definition?.eyes, depth]);
  const hit = cache.get(key);
  if (hit) return hit;
  const res = validateAvatar(definition);
  if (!res.ok) throw new Error(`Invalid avatar definition: ${res.errors.join('; ')}`);
  const def = res.value;
  const body = analyzeBody(def.body.path);
  const vol = buildVolume(def, depth / DEFAULT_DEPTH, body);
  const id = `oba-${hashString(`${def.id}|${def.body.path}|${depth}`).toString(36)}`;
  const ids = new Map<string, string>();
  for (const part of vol.parts) for (const s of [...part.zSlices, ...part.xSlices]) if (!ids.has(s.d)) ids.set(s.d, `${id}-${ids.size}`);
  const prepared: Prepared = {
    def,
    vol,
    range: gazeRange(body.polys, { ...def.eyes, scale: vol.eyeScale }),
    seed: hashString(def.id),
    id,
    ids,
    detail: new Map(),
  };
  if (cache.size >= 64) cache.delete(cache.keys().next().value as string);
  cache.set(key, prepared);
  return prepared;
}

/** The validated definition and its cached volume, exactly as the renderers use them. Throws if invalid. */
export function preparedVolume(definition: AvatarDefinition, depth?: number): { def: AvatarDefinition; vol: Volume } {
  const p = prepare(definition, depthOption({ depth }));
  return { def: p.def, vol: p.vol };
}

function poseOf(p: Prepared, options: RenderOptions): Pose {
  const motion = options.motion && MOTIONS.includes(options.motion) ? options.motion : 'idle';
  return computePose({
    seed: p.seed,
    time: Number.isFinite(options.time) ? (options.time as number) : 0,
    motionAge: Number.isFinite(options.motionAge) ? (options.motionAge as number) : undefined,
    motion,
    gaze: options.gaze,
    reducedMotion: options.reducedMotion === true,
    view: options.view,
    blend: options.motionBlend,
  });
}

/** The caller's turns: per-frame render input, not part of the mood's pose. */
interface Turns {
  face: number;
  body: number;
  whirl: number;
}

function turnsOf(options: RenderOptions): Turns {
  const num = (v: number | undefined) => (Number.isFinite(v) ? (v as number) : 0);
  return { face: num(options.faceTurn), body: num(options.bodyTurn), whirl: num(options.faceWhirl) };
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

// ---------------------------------------------------------------------------
// View math

type M = Matrix;
const mul = (m: M, n: M): M => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
const translate = (x: number, y: number): M => [1, 0, 0, 1, x, y];
const about = (x: number, y: number, m: M): M => mul(translate(x, y), mul(m, translate(-x, -y)));
const mat = (m: M) => `matrix(${m.map((v, i) => (i < 4 ? (Math.round(v * 10000) / 10000).toString() : f(v))).join(' ')})`;

export interface ViewBasis {
  cY: number;
  sY: number;
  cP: number;
  sP: number;
  /** cos(yaw)·cos(pitch): > 0 when the front faces the viewer. */
  facing: number;
}

export function viewBasis(yaw: number, pitch: number): ViewBasis {
  const cY = Math.cos(yaw), cP = Math.cos(pitch);
  return { cY, sY: Math.sin(yaw), cP, sP: Math.sin(pitch), facing: cY * cP };
}

/** Minimum facing (toward-viewer component of the surface normal) for an eye to be drawn. */
const EYE_FACING = 0.22;

/** Toward-viewer component of a model-space direction under this view (1 = straight at the viewer). */
export function facingOf(v: ViewBasis, [x, y, z]: [number, number, number]): number {
  return v.sP * y + v.cP * (-v.sY * x + v.cY * z);
}

/** Whether eye `i` is drawn: every surface normal under it must face the viewer. */
function eyeVisible(vol: Volume, v: ViewBasis, i: number): boolean {
  return vol.eyeNormals[i].every((n) => facingOf(v, n) > EYE_FACING);
}

/** Which slice stack faces the viewer more: front-facing z-planes or side-facing x-planes. */
export function activeStack(v: ViewBasis): 'z' | 'x' {
  return Math.abs(v.cY) >= Math.abs(v.sY) ? 'z' : 'x';
}

/**
 * Orthographic projection of the plane at depth z, pivoting on `pivot` at z = 0.
 * Yaw turns about the vertical axis, then pitch tips about the horizontal axis.
 */
export function planeMatrix(v: ViewBasis, z: number, pivot: Point): M {
  const [cx, cy] = pivot;
  return [
    v.cY, v.sY * v.sP, 0, v.cP,
    cx - v.cY * cx + v.sY * z,
    cy - v.cP * cy - v.sY * v.sP * cx - v.cY * v.sP * z,
  ];
}

/** Projection of the side plane x = x0, whose local coordinates are (u = -z, y). */
export function sidePlaneMatrix(v: ViewBasis, x0: number, pivot: Point): M {
  const [cx, cy] = pivot;
  return [-v.sY, v.cY * v.sP, 0, v.cP, cx + v.cY * (x0 - cx), cy - v.cP * cy + v.sY * v.sP * (x0 - cx)];
}

/**
 * Project a 3D point: screen x, screen y and depth toward the viewer. */
export function projectPoint(v: ViewBasis, [x, y, z]: [number, number, number], pivot: Point): [number, number, number] {
  const m = planeMatrix(v, z, pivot);
  const X = x - pivot[0], Y = y - pivot[1];
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5], v.sP * Y + v.cP * (-v.sY * X + v.cY * z)];
}

/**
 * The body's own turn.
 *
 * The official's bot spins inside its belt while it celebrates, and the spin
 * is about the bot's own vertical axis: the shape turns in depth, so it shows
 * its side and then its back, while the belt hangs still around it. The
 * camera does not move for the spin, so the turn belongs to the body, and it
 * is read as a turn of the shape about its own centre.
 */
function rootMatrix(pose: Pose, b: Bounds): M {
  const bx = (b.minX + b.maxX) / 2, by = b.maxY;
  const r = (pose.roll * Math.PI) / 180;
  const rot: M = [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0];
  return mul(translate(0, pose.lift), about(bx, by, mul(rot, [pose.sx, 0, 0, pose.sy, 0, 0])));
}

const pivotOf = (b: Bounds): Point => [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2];

/** The hop and the share of a point's distance from the base that roll and squash can move it. */
const POSE_LIFT = 4;
const POSE_SWAY = 0.2;

/**
 * A square of viewBox units that holds the avatar at every view and pose. Throws if invalid. The
 * canvas renderer uses it only as an upper bound: it sizes each bitmap to what is actually painted.
 */
export function avatarExtent(definition: AvatarDefinition, depth?: number): { x: number; y: number; size: number } {
  const { vol } = prepare(definition, depthOption({ depth }));
  const b = vol.bounds;
  const [cx, cy] = pivotOf(b);
  const radius = Math.hypot(b.maxX - b.minX, b.maxY - b.minY, Math.max(...vol.parts.map((part) => part.depth)) + 2 * EYE_LIFT) / 2;
  const half = radius + POSE_LIFT + POSE_SWAY * (radius + b.maxY - cy);
  return { x: cx - half, y: cy - half, size: 2 * half };
}

/**
 * The belt geometry paint that rides around the avatar is built on: the paint
 * comes from around the shape's waist, not out of its middle.
 */
export interface PaintBelt {
  /** Centre of the avatar's bounds, viewBox units. */
  cx: number;
  cy: number;
  /** Half the widest row of the silhouette. */
  belt: number;
  /** The avatar's widest dimension, for scaling design units. */
  widest: number;
}

/** Half the widest row of the shape, scanned the way the official measures its belt. */
function widestRow(polys: Point[][]): number {
  let top = Infinity;
  let bottom = -Infinity;
  for (const poly of polys) {
    for (const p of poly) {
      if (p[1] < top) top = p[1];
      if (p[1] > bottom) bottom = p[1];
    }
  }
  if (!Number.isFinite(top) || bottom <= top) return 0;
  let far = 0;
  // The official's row of the scan is a hundred and sixtieth of the shape.
  const step = (bottom - top) / 160;
  for (let y = top; y <= bottom; y += step) {
    let min = Infinity;
    let max = -Infinity;
    for (const poly of polys) {
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i];
        const b = poly[(i + 1) % poly.length];
        if (a[1] === b[1]) continue;
        // Only the edges that cross this row have a point on it.
        if (y < Math.min(a[1], b[1]) || y > Math.max(a[1], b[1])) continue;
        const x = a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]);
        if (x < min) min = x;
        if (x > max) max = x;
      }
    }
    if (max > min) far = Math.max(far, (max - min) / 2);
  }
  return far;
}

/**
 * Geometry the Grok Bot's paint rides on. The belt is half of the shape's
 * widest row, the official's own measurement: its bot fills its design space,
 * so the belt rides just off the rim, and an avatar of any shape reads the
 * same way. Throws if the definition is invalid.
 */
export function paintBelt(definition: AvatarDefinition, depth?: number): PaintBelt {
  const { vol } = prepare(definition, depthOption({ depth }));
  const b = vol.bounds;
  return {
    cx: (b.minX + b.maxX) / 2,
    cy: (b.minY + b.maxY) / 2,
    belt: widestRow(vol.parts.flatMap((part) => part.polys)),
    widest: Math.max(b.maxX - b.minX, b.maxY - b.minY),
  };
}

/**
 * Where a point on the face sits after the face's turn in the picture.
 *
 * The official turns its whole head while it celebrates and the eyes ride the
 * turn, so an eye swings around the head in a rosette rather than sliding
 * across it. A body that only turns in depth leaves the eye sliding, and the
 * eye then travels the other way round the body than the paint does. The
 * whirl turns the eye's place on the face about the body's centre, in the
 * picture, which is the turn the official's head group makes.
 */
function whirlPoint([x, y]: Point, whirl: number, pivot: Point): Point {
  if (!whirl) return [x, y];
  const c = Math.cos(whirl), s = Math.sin(whirl);
  const dx = x - pivot[0], dy = y - pivot[1];
  return [pivot[0] + dx * c - dy * s, pivot[1] + dx * s + dy * c];
}

/**
 * The view the body is seen in: the camera's turn plus the body's own turn
 * about its vertical axis.
 *
 * A turn of the body about the axis through its centre and a turn of the
 * camera about the same axis give the same picture, so the two are one number
 * here: the body is seen from the direction its own turn has carried it to.
 */
function bodyBasis(pose: Pose, bodyTurn: number): ViewBasis {
  return viewBasis(pose.yaw + bodyTurn, pose.pitch);
}

/**
 * Every cross-section a view draws, with its projection: the stack facing the
 * viewer, minus z-slices hidden behind the core (they add nothing to the
 * silhouette or the paint). Their union is the silhouette on screen.
 */
function drawnSlices(p: Prepared, v: ViewBasis, size: number | undefined, visit: (s: VolumeSlice, m: M, part: number, index: number) => void) {
  const { vol } = p;
  const stack = activeStack(v);
  const pivot = pivotOf(vol.bounds);
  const drawn = sliceCull(v);
  const kept = sliceDetail(p, stack, size);
  let k = 0;
  vol.parts.forEach((part, i) => {
    (stack === 'z' ? part.zSlices : part.xSlices).forEach((s, j) => {
      if (!kept[k++] || !drawn(s)) return;
      visit(s, stack === 'z' ? planeMatrix(v, s.at, pivot) : sidePlaneMatrix(v, s.at, pivot), i, j);
    });
  });
}

/** Whether a slice of the active stack shows: z-slices hidden behind the core are skipped. */
function sliceCull(v: ViewBasis): (s: VolumeSlice) => boolean {
  // Screen shift per unit of depth, and the smallest on-screen size of an in-plane inset.
  const sweep = Math.hypot(v.sY, v.cY * v.sP);
  const inset = Math.min(Math.abs(v.cY), Math.abs(v.cP));
  return (s) => s.axis !== 'z' || s.inset <= 0 || Math.abs(s.at) * sweep > s.inset * inset;
}

// ---------------------------------------------------------------------------
// Eyes (shared by both renderers, in face-plane coordinates)

interface EyeState {
  /** Neutral center and size. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Gaze offset. */
  dx: number;
  dy: number;
  /** Drawn pill height after blink/squint, and its downward shift (lids close toward a point below center). */
  open: number;
  shift: number;
  happy: boolean;
  /** Bored eyes: a wide, shallow bar instead of a tall pill. */
  flat: boolean;
  /** How much the eye narrows as the face turns away from the viewer. */
  sx: number;
  /** How far the face's turn carries the eye in depth, in viewBox units. */
  dz: number;
  /** Whether the face's turn leaves this eye in front of the head. */
  visible: boolean;
  /** The eye's place in the face when the face does not turn. */
  homeX: number;
}

/** The head's cross-section at one height: the ring the face turns around. */
interface FaceArc {
  /** The centre of the cross-section. */
  cx: number;
  /** How far the head reaches sideways at this height. */
  rx: number;
  /** How far the head reaches in depth. */
  rz: number;
}

function faceArc(p: Prepared, y: number): FaceArc | null {
  const part = p.vol.parts[p.vol.eyePart];
  const span = spanAt(part.polys, y);
  if (!span) return null;
  const [minX, maxX] = span;
  return {
    cx: (minX + maxX) / 2,
    rx: Math.max((maxX - minX) / 2, 12),
    rz: Math.max(part.depth / 2, 0.5),
  };
}

function eyeStates(p: Prepared, pose: Pose, faceTurn: number): [EyeState, EyeState] {
  const s = p.vol.eyeScale;
  const shape = pose.eyeShape;
  const flat = shape === 'flat';
  const w = EYE_W * s * (flat ? FLAT_WIDTH : 1), h = EYE_H * s;
  const r = p.range;
  const dx = pose.gazeX * (pose.gazeX >= 0 ? r.right : r.left) * GAZE_X * s;
  const dy = pose.gazeY * (pose.gazeY >= 0 ? r.down : r.up) * GAZE_Y * s;
  const centers = eyeCenters(p.def.eyes);
  // The face turns inside the head: the pair rides the head's cross-section, so it
  // swings around the head, narrows as it turns away and is gone once it passes the
  // back. The head's own turn carries the face around with it.
  const turn = faceTurn;
  return ([0, 1] as const).map((i) => {
    const squint = i === 0 ? pose.squintL : pose.squintR;
    const lid = (1 - pose.blink) * (1 - squint * 0.4);
    const open = flat
      ? Math.max(h * 0.1, h * FLAT_OPEN * lid)
      : Math.max(h * Math.max(0.09, lid), w * 0.55);
    const [ex, ey] = centers[i];
    let x = ex;
    let sx = 1;
    let dz = 0;
    let visible = true;
    if (turn) {
      const arc = faceArc(p, ey);
      if (arc) {
        // The eye's own place on the ring, and where the turn carries it.
        const r0 = Math.asin(clamp((ex - arc.cx) / arc.rx, -1, 1));
        const s = r0 + turn;
        const c = Math.cos(s);
        visible = c > 0.02;
        sx = Math.max(c, 0.02) / Math.max(Math.cos(r0), 0.02);
        x = arc.cx + arc.rx * Math.sin(s);
        dz = arc.rz * (c - Math.cos(r0));
      }
    }
    return {
      x, y: ey, w, h, dx, dy, open,
      shift: (h - open) * (flat ? 0.05 : 0.18), happy: shape === 'happy', flat,
      sx, dz, visible, homeX: ex,
    };
  }) as [EyeState, EyeState];
}

function happyArc(e: EyeState): string {
  const ex = e.x + e.dx, ey = e.y + e.dy;
  const hw = e.w * e.sx * HAPPY_ARC.halfWidth, base = ey + e.h * HAPPY_ARC.base;
  return `M${f(ex - hw)} ${f(base)}Q${f(ex)} ${f(ey - e.h * HAPPY_ARC.peak)} ${f(ex + hw)} ${f(base)}`;
}

function eyeMark(e: EyeState): EyeMark {
  if (e.happy) return { shape: 'arc', d: happyArc(e), strokeWidth: e.w * e.sx * HAPPY_ARC.stroke };
  const ex = e.x + e.dx, ey = e.y + e.dy;
  const w = e.w * e.sx;
  const cx = ex, cy = ey + e.shift;
  return { shape: 'pill', x: cx - w / 2, y: cy - e.open / 2, width: w, height: e.open, radius: Math.min(w, e.open) / 2 };
}

function colors(options: RenderOptions): { color: string; ink: string } {
  return {
    color: toHex(parseHex(options.color) ?? (parseHex(DEFAULT_COLOR) as Rgb)),
    ink: toHex(parseHex(options.eyeColor) ?? (parseHex(DEFAULT_EYE_COLOR) as Rgb)),
  };
}

// ---------------------------------------------------------------------------
// Flat frames: the whole projected avatar as plain data

/** 2D affine matrix in SVG order (a b c d e f). */
export type Matrix = [number, number, number, number, number, number];

/** How one eye is drawn, in its face plane's coordinates (viewBox units). */
export type EyeMark =
  | { shape: 'pill'; x: number; y: number; width: number; height: number; radius: number }
  | { shape: 'arc'; d: string; strokeWidth: number };

export type FrameShape =
  | {
      kind: 'slice';
      /** Stable across frames for the same cross-section: use it as a key in retained renderers. */
      key: string;
      /** Id of an entry in AvatarFrame.paths. */
      path: string;
      matrix: Matrix;
    }
  | { kind: 'eye'; key: 'eye-0' | 'eye-1'; matrix: Matrix; mark: EyeMark };

/** One cross-section outline, shared by every shape that draws it. */
export interface FramePath {
  id: string;
  d: string;
  evenOdd: boolean;
  box: { x: number; y: number; w: number; h: number };
}

/**
 * One frame of the avatar flattened onto the screen: every cross-section the
 * view draws with its projection, and the visible eyes, sorted back to front.
 * Painting them in order (body paths in `color`, eyes in `ink`) inside the
 * `root` transform and a 0 0 100 100 viewBox gives the avatar exactly as
 * renderAvatarSvg draws it. Plain numbers and path strings, so any vector
 * renderer (SVG, canvas, Skia, react-native-svg) can draw it.
 */
export interface AvatarFrame {
  name: string;
  color: string;
  ink: string;
  /**
   * Distinct cross-section paths this frame uses; ids are stable for equal geometry and depth.
   * `box` bounds `d` in its own coordinates, before a shape's matrix.
   */
  paths: FramePath[];
  /** 2D motion (hop, roll, squash) about the base of the body, applied to every shape. */
  root: Matrix;
  /** Back to front. */
  shapes: FrameShape[];
}

/** Compute one flat frame of a definition. Throws if the definition is invalid. */
export function avatarFrame(definition: AvatarDefinition, options: RenderOptions = {}): AvatarFrame {
  return flatFrame(definition, options, undefined);
}

/**
 * avatarFrame for a live avatar drawn `options.size` CSS pixels wide: like the scene, it skips
 * cross-sections that would sit less than a pixel apart. Internal to the live renderers, so
 * `size` never changes what avatarFrame returns to custom renderers.
 */
export function liveFrame(definition: AvatarDefinition, options: RenderOptions = {}): AvatarFrame {
  return flatFrame(definition, options, options.size);
}

function flatFrame(definition: AvatarDefinition, options: RenderOptions, size: number | undefined): AvatarFrame {
  const p = prepare(definition, depthOption(options));
  const { vol } = p;
  const b = vol.bounds;
  const { color, ink } = colors(options);
  const pose = poseOf(p, options);
  const turns = turnsOf(options);
  const pivot = pivotOf(b);
  const v = bodyBasis(pose, turns.body);
  const stack = activeStack(v);
  const eyesMid: Point = [p.def.eyes.x, p.def.eyes.y];

  // Only the cross-sections this view draws are listed; ids are stable across frames.
  const paths = new Map<string, FramePath>();
  const items: { depth: number; shape: FrameShape }[] = [];
  // The turn of the body: it carries the shape and the face together.
  drawnSlices(p, v, size, (s, m, i, j) => {
    let path = paths.get(s.d);
    if (!path) {
      path = { id: p.ids.get(s.d) as string, d: s.d, evenOdd: s.evenOdd, box: { ...s.box } };
      paths.set(s.d, path);
    }
    // Depth keys are taken under the eyes for the eye part, so only depth decides eye-vs-body order there.
    const [rx, ry] = i === vol.eyePart ? eyesMid : vol.parts[i].center;
    const depth = stack === 'z' ? projectPoint(v, [rx, ry, s.at], pivot)[2] : projectPoint(v, [s.at, ry, 0], pivot)[2];
    items.push({ depth, shape: { kind: 'slice', key: `${i}${stack}${j}`, path: path.id, matrix: m } });
  });
  // Painted on the surface; each eye goes once the surface under it turns away.
  eyeStates(p, pose, turns.face).forEach((e, idx) => {
    if (e.visible && eyeVisible(vol, v, idx)) {
      const z = vol.eyeZ[idx] + EYE_LIFT + e.dz;
      // The whirl turns the eye in the face's own plane, so the mark rides the
      // turn: the eye swings round the head the way the official's does.
      const w = turns.whirl;
      const turn: M = [Math.cos(w), Math.sin(w), -Math.sin(w), Math.cos(w), 0, 0];
      items.push({
        // Depth is keyed at the face's midpoint, like the slices it sorts
        // against; an eye's own x would put the far eye behind its own face.
        depth: projectPoint(v, [eyesMid[0], eyesMid[1], z], pivot)[2] + 1e-6,
        shape: {
          kind: 'eye',
          key: idx === 0 ? 'eye-0' : 'eye-1',
          matrix: w ? mul(planeMatrix(v, z, pivot), about(pivot[0], pivot[1], turn)) : planeMatrix(v, z, pivot),
          mark: eyeMark(e),
        },
      });
    }
  });
  items.sort((a, c) => a.depth - c.depth);
  return { name: p.def.name, color, ink, paths: [...paths.values()], root: rootMatrix(pose, b), shapes: items.map((it) => it.shape) };
}

// ---------------------------------------------------------------------------
// Standalone SVG still

function eyeSvg(mark: EyeMark, ink: string): string {
  if (mark.shape === 'arc') {
    return `<path d="${mark.d}" fill="none" stroke="${ink}" stroke-width="${f(mark.strokeWidth)}" stroke-linecap="round"/>`;
  }
  return `<rect x="${f(mark.x)}" y="${f(mark.y)}" width="${f(mark.width)}" height="${f(mark.height)}" rx="${f(mark.radius)}" fill="${ink}"/>`;
}

/** Render a definition to a standalone SVG string. Throws if the definition is invalid. */
export function renderAvatarSvg(definition: AvatarDefinition, options: RenderOptions = {}): string {
  const frame = avatarFrame(definition, options);
  const defsMarkup = frame.paths.map((d) => `<path id="${d.id}" d="${d.d}"${d.evenOdd ? ' fill-rule="evenodd"' : ''}/>`).join('');
  const body = frame.shapes
    .map((s) => (s.kind === 'slice' ? `<use href="#${s.path}" transform="${mat(s.matrix)}"/>` : `<g transform="${mat(s.matrix)}">${eyeSvg(s.mark, frame.ink)}</g>`))
    .join('');
  const size = Number.isFinite(options.size) && (options.size as number) > 0 ? f(clamp(options.size as number, 8, 4096)) : null;
  const dims = size ? ` width="${size}" height="${size}"` : '';
  const label = esc(frame.name);

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"${dims} role="img" aria-label="${label}" overflow="visible">` +
    `<title>${label}</title>` +
    `<defs>${defsMarkup}</defs>` +
    `<g transform="${mat(frame.root)}" fill="${frame.color}">` +
    body +
    `</g></svg>`
  );
}

// ---------------------------------------------------------------------------
// Live CSS 3D scene

/** 1 viewBox unit = 1% of the scene's (square) container width. */
const u = (n: number) => `${f(n)}cqw`;
const FILL = 'position:absolute;left:0;top:0;width:100%;height:100%;';

function sliceMarkup(s: VolumeSlice): string {
  const pad = 0.3;
  const x = s.box.x - pad, y = s.box.y - pad, w = s.box.w + 2 * pad, h = s.box.h + 2 * pad;
  const rule = s.evenOdd ? ' fill-rule="evenodd"' : '';
  const place = s.axis === 'z'
    ? `left:${u(x)};top:${u(y)};transform:translateZ(${u(s.at)})`
    : // The side plane's u = 0 line sits at x = s.at; turning it 90° about that line maps u to -z.
      `left:${u(s.at + x)};top:${u(y)};transform-origin:${u(-x)} 50%;transform:rotateY(90deg)`;
  return (
    `<svg viewBox="${f(x)} ${f(y)} ${f(w)} ${f(h)}" style="position:absolute;width:${u(w)};height:${u(h)};overflow:visible;${place}" aria-hidden="true">` +
    `<path d="${s.d}"${rule} fill="currentColor"/></svg>`
  );
}

/**
 * Static markup of the live scene for a definition and depth. Mount it once,
 * then apply `sceneFrame` every frame. Body color comes from CSS `color` on
 * an ancestor, eye ink from `--avatar-ink`.
 */
export function renderAvatarScene(definition: AvatarDefinition, options: Pick<RenderOptions, 'depth'> = {}): string {
  const p = prepare(definition, depthOption(options));
  const { vol } = p;
  const b = vol.bounds;
  const [cx, cy] = pivotOf(b);
  const ink = `var(--avatar-ink,${DEFAULT_EYE_COLOR})`;
  const stack = (axis: 'z' | 'x') =>
    `<div data-stack="${axis}" style="${FILL}transform-style:preserve-3d">` +
    vol.parts.map((part) => (axis === 'z' ? part.zSlices : part.xSlices).map(sliceMarkup).join('')).join('') +
    `</div>`;
  const eyes = eyeStates(p, poseOf(p, { reducedMotion: true }), 0).map((e, i) => {
    const box = `left:${u(e.x - e.w / 2)};top:${u(e.y - e.h / 2)};width:${u(e.w)};height:${u(e.h)}`;
    return (
      `<div data-eye="${i}" style="position:absolute;${box};backface-visibility:hidden;transform:translateZ(${u(vol.eyeZ[i] + EYE_LIFT)})">` +
      `<i style="position:absolute;inset:0;border-radius:999px;background:${ink}"></i>` +
      `<svg viewBox="${f(e.x - e.w / 2)} ${f(e.y - e.h / 2)} ${f(e.w)} ${f(e.h)}" style="${FILL}overflow:visible;display:none" aria-hidden="true">` +
      `<path d="${happyArc(e)}" fill="none" stroke="${ink}" stroke-width="${f(e.w * HAPPY_ARC.stroke)}" stroke-linecap="round"/></svg>` +
      `</div>`
    );
  });
  return (
    `<div data-avatar-scene="${p.id}" style="position:relative;width:100%;height:100%;container-type:size">` +
    // will-change pins the slices' raster scale: without it every hop and squash re-rasterizes each slice.
    `<div data-motion style="${FILL}will-change:transform;transform-origin:${u((b.minX + b.maxX) / 2)} ${u(b.maxY)}">` +
    `<div data-view style="${FILL}transform-style:preserve-3d;transform-origin:${u(cx)} ${u(cy)}">` +
    // The spinning group: the body and the face turn together inside it, about
    // the body's own vertical axis, while the paint outside hangs still in the world.
    `<div data-spin style="${FILL}transform-style:preserve-3d;transform-origin:${u(cx)} ${u(cy)}">` +
    stack('z') + stack('x') + eyes.join('') +
    `</div></div></div></div>`
  );
}

export interface SceneFrame {
  /** Identifies the static markup this frame belongs to. */
  scene: string;
  /** 2D motion (hop, roll, squash) about the base of the body. */
  motion: string;
  /** 3D view rotation about the body center. */
  view: string;
  /** The body's own turn, about its vertical axis, in depth. */
  spin: string;
  stack: 'z' | 'x';
  /** Per slice of the active stack, in markup order: whether it shows. Hidden ones need no layer. */
  slices: boolean[];
  eyes: { visible: boolean; happy: boolean; flat: boolean; transform: string; pill: string }[];
}

const r4 = (n: number) => Math.round(n * 10000) / 10000;

/** Closest on-screen spacing, CSS px, between cross-sections a small live avatar keeps. */
const SLICE_GAP_PX = 0.75;

/**
 * Per slice of a stack, in markup order: whether it is kept at this rendered size. Within each part,
 * slices closer than SLICE_GAP_PX to the last kept one are dropped; the outermost always stay, and
 * so does the core, which sliceCull relies on to cover the inset slices it hides.
 */
function sliceDetail(p: Prepared, stack: 'z' | 'x', size: number | undefined): boolean[] {
  const px = Number.isFinite(size) && (size as number) > 0 ? Math.round(size as number) : 0;
  const key = `${stack}${px}`;
  let keep = p.detail.get(key);
  if (keep) return keep;
  const gap = px ? (SLICE_GAP_PX * 100) / px : 0;
  keep = p.vol.parts.flatMap((part) => {
    const slices = stack === 'z' ? part.zSlices : part.xSlices;
    let last = -Infinity;
    return slices.map((s, j) => {
      const core = s.axis === 'z' && s.at === 0 && s.inset === 0;
      const kept = core || j === 0 || j === slices.length - 1 || s.at - last >= gap;
      if (kept) last = s.at;
      return kept;
    });
  });
  if (p.detail.size >= 32) p.detail.clear();
  p.detail.set(key, keep);
  return keep;
}

/** Per-frame CSS for a mounted scene. Pure and cheap: no geometry is rebuilt. */
export function sceneFrame(definition: AvatarDefinition, options: RenderOptions = {}): SceneFrame {
  const p = prepare(definition, depthOption(options));
  const pose = poseOf(p, options);
  const turns = turnsOf(options);
  const v = bodyBasis(pose, turns.body);
  const pivot = pivotOf(p.vol.bounds);
  const states = eyeStates(p, pose, turns.face);
  const stack = activeStack(v);
  const drawn = sliceCull(v);
  const kept = sliceDetail(p, stack, options.size);
  let k = 0;
  return {
    scene: p.id,
    motion: `translate(0,${u(pose.lift)}) rotate(${f(pose.roll)}deg) scale(${r4(pose.sx)},${r4(pose.sy)})`,
    // The view is the camera: the user's drag, the gaze and the pitch. The
    // official never turns its root in depth, so neither do we.
    view: `rotateX(${r4(pose.pitch)}rad) rotateY(${r4(pose.yaw)}rad)`,
    // The body's own turn is about its vertical axis, in depth: the shape
    // turns inside the belt and shows its side and its back, the way the
    // official's bot spins in its belt. The camera does not carry it.
    spin: `rotateY(${r4(turns.body)}rad)`,
    stack,
    slices: p.vol.parts.flatMap((part) => (stack === 'z' ? part.zSlices : part.xSlices).map((s) => kept[k++] && drawn(s))),
    eyes: states.map((e, i) => {
      // The face's own turn carries the eye around the head; the body's turn
      // carries both, so the eye only has to hold its place on the face.
      // The whirl turns that place about the body's centre, so the eye swings
      // round the head the way the official's does.
      const at = whirlPoint([e.x + e.dx, e.y + e.dy], turns.whirl, pivot);
      const whirl = turns.whirl ? `rotate(${r4(turns.whirl)}rad) ` : '';
      return {
        visible: e.visible && eyeVisible(p.vol, v, i),
        happy: e.happy,
        flat: e.flat,
        transform:
          `translateZ(${u(p.vol.eyeZ[i] + EYE_LIFT + e.dz)}) ` +
          `translate(${u(at[0] - e.homeX)},${u(at[1] - e.y)}) ` +
          whirl +
          `scale(${r4(e.sx)},1)`,
        pill: `translateY(${u(e.shift)}) scale(${r4(e.flat ? FLAT_WIDTH : 1)},${r4(e.open / e.h)})`,
      };
    }),
  };
}
