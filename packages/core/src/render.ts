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
import { computePose, hashString, isActivity, isMotion } from './motion.ts';
import type { Pose } from './motion.ts';
import { FACE_TRAVEL, eyePoints, outlinePath, type EyeFrame } from './face.ts';
import { insideRow } from './path.ts';
import type { Bounds, Point } from './path.ts';
import { EYE_CLEARANCE, EYE_H, EYE_W, GAZE_X, GAZE_Y, analyzeBody, eyeCenters, gazeRange, validateAvatar } from './validate.ts';
import type { GazeRange } from './validate.ts';
import { buildVolume } from './volume.ts';
import type { Volume, VolumeSlice } from './volume.ts';
import type { AvatarActivity, AvatarDefinition, AvatarMotion, RenderOptions } from './types.ts';

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

interface Prepared {
  def: AvatarDefinition;
  vol: Volume;
  range: GazeRange;
  /** Body outline, for fitting expressions; rasterized on first use (see bodyMask). */
  polys: Point[][];
  mask?: Uint8Array;
  /** Per mood and activity pair, the share of its expression that fits (see moodFit). */
  fit: Map<string, number>;
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
    polys: body.polys,
    fit: new Map(),
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
  const motion = isMotion(options.motion) ? options.motion : 'idle';
  return computePose({
    seed: p.seed,
    time: Number.isFinite(options.time) ? (options.time as number) : 0,
    motion,
    activity: isActivity(options.activity) ? options.activity : undefined,
    gaze: options.gaze,
    reducedMotion: options.reducedMotion === true,
    view: options.view,
    blend: options.motionBlend,
    fit: (m, a) => moodFit(p, m, a),
  });
}

const FIT_STEPS = [1, 0.8, 0.6, 0.4, 0.2, 0];
const FIT_TIMES = [0, 0.4, 0.9, 1.4, 2, 2.7, 3.5, 4.4, 5.3, 6.1];
const FIT_LOOKS = [undefined, { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];

/**
 * The largest share of a mood and activity pair's expression (eye growth, tilt and face travel) whose eyes keep
 * EYE_CLEARANCE inside the outline across the pair's motion and any look direction. At 0 the
 * eyes stay within the neutral pill, which validation already guarantees. Cached per avatar.
 */
const MASK_STEP = 0.25, MASK_N = 100 / MASK_STEP;

/** Whether a point lies inside the body, from a bitmap of the outline (exact to a quarter unit). */
function inBody(p: Prepared, x: number, y: number): boolean {
  if (!p.mask) {
    const mask = new Uint8Array(MASK_N * MASK_N);
    const xs = Array.from({ length: MASK_N }, (_, i) => (i + 0.5) * MASK_STEP);
    const row = new Uint8Array(MASK_N);
    for (let j = 0; j < MASK_N; j++) {
      insideRow(p.polys, (j + 0.5) * MASK_STEP, xs, row);
      mask.set(row, j * MASK_N);
    }
    p.mask = mask;
  }
  const i = Math.floor(x / MASK_STEP), j = Math.floor(y / MASK_STEP);
  return i >= 0 && j >= 0 && i < MASK_N && j < MASK_N && p.mask[j * MASK_N + i] === 1;
}

function moodFit(p: Prepared, motion: AvatarMotion, activity?: AvatarActivity): number {
  const key = `${motion}|${activity ?? ''}`;
  const known = p.fit.get(key);
  if (known !== undefined) return known;
  const fits = (k: number) =>
    FIT_TIMES.every((time) =>
      FIT_LOOKS.every((gaze) => {
        const pose = computePose({ seed: p.seed, time, motion, activity, gaze, reducedMotion: false, fit: () => k });
        return eyeFrames(p, pose, EYE_CLEARANCE).every((frame, i) => eyePoints(pose.eyes[i], frame).every(([x, y]) => inBody(p, x, y)));
      }),
    );
  const k = FIT_STEPS.find((step) => step === 0 || fits(step)) ?? 0;
  p.fit.set(key, k);
  return k;
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

/** Project a 3D point: screen x, screen y and depth toward the viewer. */
export function projectPoint(v: ViewBasis, [x, y, z]: [number, number, number], pivot: Point): [number, number, number] {
  const m = planeMatrix(v, z, pivot);
  const X = x - pivot[0], Y = y - pivot[1];
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5], v.sP * Y + v.cP * (-v.sY * X + v.cY * z)];
}

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

/** Where each eye sits this frame and its neutral size; `inflate` grows the outline (fit tests). */
function eyeFrames(p: Prepared, pose: Pose, inflate = 0): [EyeFrame, EyeFrame] {
  const s = p.vol.eyeScale;
  const r = p.range;
  const dx = pose.gazeX * (pose.gazeX >= 0 ? r.right : r.left) * GAZE_X * s + pose.faceX * FACE_TRAVEL * s;
  const dy = pose.gazeY * (pose.gazeY >= 0 ? r.down : r.up) * GAZE_Y * s + pose.faceY * FACE_TRAVEL * s;
  const centers = eyeCenters(p.def.eyes);
  return ([0, 1] as const).map((i) => ({
    x: centers[i][0] + dx, y: centers[i][1] + dy, w: EYE_W * s, h: EYE_H * s,
    inward: i === 0 ? 1 : -1, blink: pose.blink, inflate,
  })) as [EyeFrame, EyeFrame];
}

/** Each eye's outline as a filled path, face-plane coordinates. */
function eyePaths(p: Prepared, pose: Pose): [string, string] {
  return eyeFrames(p, pose).map((frame, i) => outlinePath(eyePoints(pose.eyes[i], frame))) as [string, string];
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

/** How one eye is drawn, in its face plane's coordinates (viewBox units): a filled closed path. */
export type EyeMark = { shape: 'path'; d: string };

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
  const pivot = pivotOf(b);
  const v = viewBasis(pose.yaw, pose.pitch);
  const stack = activeStack(v);
  const eyesMid: Point = [p.def.eyes.x, p.def.eyes.y];

  // Only the cross-sections this view draws are listed; ids are stable across frames.
  const paths = new Map<string, FramePath>();
  const items: { depth: number; shape: FrameShape }[] = [];
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
  eyePaths(p, pose).forEach((d, idx) => {
    if (eyeVisible(vol, v, idx)) {
      const z = vol.eyeZ[idx] + EYE_LIFT;
      items.push({
        depth: projectPoint(v, [eyesMid[0], eyesMid[1], z], pivot)[2] + 1e-6,
        shape: { kind: 'eye', key: idx === 0 ? 'eye-0' : 'eye-1', matrix: planeMatrix(v, z, pivot), mark: { shape: 'path', d } },
      });
    }
  });
  items.sort((a, c) => a.depth - c.depth);
  return { name: p.def.name, color, ink, paths: [...paths.values()], root: rootMatrix(pose, b), shapes: items.map((it) => it.shape) };
}

// ---------------------------------------------------------------------------
// Standalone SVG still

function eyeSvg(mark: EyeMark, ink: string): string {
  return `<path d="${mark.d}" fill="${ink}"/>`;
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
  // Each eye is one path over the whole face plane; sceneFrame gives its outline every frame.
  const eyes = eyePaths(p, poseOf(p, { reducedMotion: true })).map((d, i) =>
    `<svg data-eye="${i}" viewBox="0 0 100 100" style="${FILL}overflow:visible;backface-visibility:hidden;transform:translateZ(${u(vol.eyeZ[i] + EYE_LIFT)})" aria-hidden="true">` +
    `<path d="${d}" fill="${ink}"/></svg>`,
  );
  return (
    `<div data-avatar-scene="${p.id}" style="position:relative;width:100%;height:100%;container-type:size">` +
    // will-change pins the slices' raster scale: without it every hop and squash re-rasterizes each slice.
    `<div data-motion style="${FILL}will-change:transform;transform-origin:${u((b.minX + b.maxX) / 2)} ${u(b.maxY)}">` +
    `<div data-view style="${FILL}transform-style:preserve-3d;transform-origin:${u(cx)} ${u(cy)}">` +
    stack('z') + stack('x') + eyes.join('') +
    `</div></div></div>`
  );
}

export interface SceneFrame {
  /** Identifies the static markup this frame belongs to. */
  scene: string;
  /** 2D motion (hop, roll, squash) about the base of the body. */
  motion: string;
  /** 3D view rotation about the body center. */
  view: string;
  stack: 'z' | 'x';
  /** Per slice of the active stack, in markup order: whether it shows. Hidden ones need no layer. */
  slices: boolean[];
  /** Per eye: whether it shows, and its outline (a path `d` in the 0 0 100 100 face plane). */
  eyes: { visible: boolean; d: string }[];
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
  const v = viewBasis(pose.yaw, pose.pitch);
  const paths = eyePaths(p, pose);
  const stack = activeStack(v);
  const drawn = sliceCull(v);
  const kept = sliceDetail(p, stack, options.size);
  let k = 0;
  return {
    scene: p.id,
    motion: `translate(0,${u(pose.lift)}) rotate(${f(pose.roll)}deg) scale(${r4(pose.sx)},${r4(pose.sy)})`,
    view: `rotateX(${r4(pose.pitch)}rad) rotateY(${r4(pose.yaw)}rad)`,
    stack,
    slices: p.vol.parts.flatMap((part) => (stack === 'z' ? part.zSlices : part.xSlices).map((s) => kept[k++] && drawn(s))),
    eyes: paths.map((d, i) => ({ visible: eyeVisible(p.vol, v, i), d })),
  };
}
