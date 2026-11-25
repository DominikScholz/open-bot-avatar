/**
 * The canvas renderer, the default for live avatars: paints flat avatar frames
 * to one canvas, so an avatar costs one compositor layer and one small bitmap
 * however many slices it shows. Equal geometry shares its parsed paths.
 *
 * The bitmap covers what the frames actually paint, plus slack, and only grows
 * while the avatar's size and the pixel ratio stay the same. A GPU canvas that
 * animates antialiased paths holds several times its bitmap in video memory,
 * so covering every possible view up front (avatarExtent, kept as the upper
 * bound) would cost about three times as much.
 *
 * For live avatars (`paintLiveCanvas`), when a frame has no ribbons or state
 * marks, 2D root motion (hop, roll, squash) is applied as a CSS transform on
 * the canvas wrapper rather than re-rasterizing the bitmap; the canvas only
 * repaints when the 3D view, eyes, color, material or size changes past a
 * sub-pixel threshold. Direct `paintCanvas` calls (e.g. stills and PNG export)
 * always bake `frame.root` into the bitmap.
 */
import { avatarExtent, preparedVolume, ribbonPointsOf } from '../render.ts';
import type { AvatarFrame, EyeMark, FramePath, FrameShape, LiveTransform, Matrix, SurfaceEye, ViewBasis } from '../render.ts';
import type { AvatarDefinition } from '../types.ts';
import type { Volume } from '../volume.ts';
import { eyeBox, paintEye } from './eye.ts';
import { paintMark } from './materials/marks.ts';
import { canvasMaterialOf, type AvatarMaterial, type CanvasMaterial } from './materials/material.ts';

/** A square in viewBox units. */
export interface Square {
  x: number;
  y: number;
  size: number;
}

/** An axis-aligned box in viewBox units; empty when x0 > x1. */
export interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Slack around a frame's bounds when the bitmap is laid out, viewBox units: idle motion and gaze stay inside it. */
export const FIT_SLACK = 8;
/** Margin a frame keeps from the bitmap's edge for antialiasing, viewBox units. */
export const FIT_PAD = 1;

/**
 * The square to lay the bitmap out over: `prev` while it still holds `b`, else `prev` grown to
 * hold `b` with slack. Never larger than `cap` unless `b` itself leaves `cap`.
 */
export function fitSquare(prev: Square | null, b: Bounds, cap: Square): Square {
  if (!(b.x0 <= b.x1 && b.y0 <= b.y1)) return prev ?? cap;
  if (
    prev &&
    b.x0 - FIT_PAD >= prev.x &&
    b.y0 - FIT_PAD >= prev.y &&
    b.x1 + FIT_PAD <= prev.x + prev.size &&
    b.y1 + FIT_PAD <= prev.y + prev.size
  ) {
    return prev;
  }
  let x0 = b.x0 - FIT_SLACK, y0 = b.y0 - FIT_SLACK, x1 = b.x1 + FIT_SLACK, y1 = b.y1 + FIT_SLACK;
  if (prev) {
    x0 = Math.min(x0, prev.x);
    y0 = Math.min(y0, prev.y);
    x1 = Math.max(x1, prev.x + prev.size);
    y1 = Math.max(y1, prev.y + prev.size);
  }
  const size = Math.max(x1 - x0, y1 - y0);
  const inCap = b.x0 >= cap.x && b.y0 >= cap.y && b.x1 <= cap.x + cap.size && b.y1 <= cap.y + cap.size;
  if (size >= cap.size && inCap) return cap;
  return { x: (x0 + x1 - size) / 2, y: (y0 + y1 - size) / 2, size };
}

interface Section {
  d: string;
  box: FramePath['box'];
  path: Path2D;
  rule: CanvasFillRule;
  /** A mark's part that is a ball or a capsule (see MarkPart.round). */
  round: boolean;
}

const MAX_SECTIONS = 1024;
const sections = new Map<string, Section>();

let supported: boolean | undefined;
/** Whether this environment can paint avatars: a 2D canvas and Path2D (jsdom has neither). */
export function canvasSupported(): boolean {
  if (supported === undefined) {
    // Path2D first: asking jsdom for a context logs a "not implemented" error.
    supported = typeof Path2D !== 'undefined' && typeof document !== 'undefined' && !!document.createElement('canvas').getContext('2d');
  }
  return supported;
}

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/**
 * Each shape's matrix with `root` applied, and the bounds of everything the frame paints, in
 * viewBox units. Pure.
 */
function placementWith(frame: AvatarFrame, root: Matrix): { matrices: Matrix[]; bounds: Bounds } {
  const boxes = new Map(frame.paths.map((p) => [p.id, p.box]));
  const [ra, rb, rc, rd, re, rf] = root;
  const bounds: Bounds = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const add = (m: Matrix, x: number, y: number) => {
    const X = m[0] * x + m[2] * y + m[4], Y = m[1] * x + m[3] * y + m[5];
    if (X < bounds.x0) bounds.x0 = X;
    if (X > bounds.x1) bounds.x1 = X;
    if (Y < bounds.y0) bounds.y0 = Y;
    if (Y > bounds.y1) bounds.y1 = Y;
  };
  const matrices = frame.shapes.map((shape) => {
    const [a, b, c, d, e, f] = shape.matrix;
    const m: Matrix = [ra * a + rc * b, rb * a + rd * b, ra * c + rc * d, rb * c + rd * d, ra * e + rc * f + re, rb * e + rd * f + rf];
    const box = shape.kind === 'slice' ? boxes.get(shape.path) : shape.kind === 'eye' ? eyeBox(shape.mark) : shape.box;
    if (box) {
      add(m, box.x, box.y);
      add(m, box.x + box.w, box.y);
      add(m, box.x, box.y + box.h);
      add(m, box.x + box.w, box.y + box.h);
    }
    return m;
  });
  return { matrices, bounds };
}

/**
 * Each shape's matrix with the frame's root motion applied, and the bounds of everything the frame
 * paints, in viewBox units. Pure.
 */
export function framePlacement(frame: AvatarFrame): { matrices: Matrix[]; bounds: Bounds } {
  return placementWith(frame, frame.root);
}

/** Max CSS-pixel surface shift below which the retained canvas bitmap is reused (2D root motion still runs via CSS transform). */
const VIEW_EPS_CSS_PX = 0.6;
/** Defer minor idle material coat refreshes past this per-frame budget so multiple WebGL avatars stagger smoothly. */
const COAT_STAGGER_PX = 2.5;
const MAX_IDLE_COATS_PER_FRAME = 2;
let coatFrameTime = -1;
let coatFrameCount = 0;
const deferredCoats = new Set<CanvasSurface>();
const coatPriority = new Set<CanvasSurface>();
let materialEpoch = 0;

/** Current material epoch, incremented on WebGL context restore so stills and cached bitmaps refresh. */
export function currentMaterialEpoch(): number {
  return materialEpoch;
}

/** Invalidate retained material bitmaps (e.g. after a WebGL2 context is restored). */
export function invalidateMaterialCache() {
  materialEpoch++;
}

/** Cancel any pending coat-stagger reservation when a surface pauses (e.g. offscreen or still). */
export function cancelDeferredCoat(surface: CanvasSurface) {
  deferredCoats.delete(surface);
  coatPriority.delete(surface);
}

/** Drop a surface from any pending stagger queue and release its GPU bitmap when unmounted. */
export function releaseCanvas(surface: CanvasSurface) {
  cancelDeferredCoat(surface);
  surface.painted = null;
  surface.canvas.width = 0;
  surface.canvas.height = 0;
}

interface PaintedState {
  material: CanvasMaterial | null;
  epoch: number;
  fill: string;
  ink: string;
  layout: string;
  bodyScale: number;
  eyesKey: string;
  view: ViewBasis;
  rx: number;
  ry: number;
  rz: number;
}

/** Exact upper bound on screen-space displacement (viewBox units) of a box (±rx, ±ry, ±rz) between two views. */
function viewShift(a: ViewBasis, b: ViewBasis, rx: number, ry: number, rz: number): number {
  const dx = rx * Math.abs(a.cY - b.cY) + rz * Math.abs(a.sY - b.sY);
  const dy =
    ry * Math.abs(a.cP - b.cP) +
    rx * Math.abs(a.sY * a.sP - b.sY * b.sP) +
    rz * Math.abs(a.cY * a.sP - b.cY * b.sP);
  return Math.hypot(dx, dy);
}

function eyeMarkKey(m: EyeMark): string {
  if (m.shape === 'pill') return `p:${Math.round(m.width * 20)},${Math.round(m.height * 20)},${Math.round(m.radius * 20)}`;
  if (m.shape === 'arc') return `a:${Math.round(m.strokeWidth * 20)}:${m.d}`;
  return `d:${m.d}`;
}

export function eyesCacheKey(eyes: SurfaceEye[]): string {
  let key = '';
  for (let i = 0; i < eyes.length; i++) {
    const e = eyes[i];
    if (i > 0) key += '|';
    key += `${Math.round(e.dx * 20)},${Math.round(e.dy * 20)},${eyeMarkKey(e.mark)}`;
  }
  return key;
}

const r4 = (n: number) => Math.round(n * 10000) / 10000;
const r2 = (n: number) => Math.round(n * 100) / 100;

function rootCss(root: Matrix, size: number): string {
  const [a, b, c, d, e, f] = root;
  if (a === 1 && b === 0 && c === 0 && d === 1 && e === 0 && f === 0) return '';
  const k = size / 100;
  return `matrix(${r4(a)},${r4(b)},${r4(c)},${r4(d)},${r2(e * k)},${r2(f * k)})`;
}

function setCanvasTransform(surface: CanvasSurface, next: string) {
  if (surface.transform === next) return;
  if (next && !surface.promoted) {
    surface.canvas.style.willChange = 'transform';
    surface.promoted = true;
  }
  surface.transform = next;
  surface.canvas.style.transform = next;
}

/** A mounted canvas and the square and size its bitmap was last laid out at. */
export interface CanvasSurface {
  key: string;
  wrap: HTMLDivElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | null;
  /** The avatar's volume, for a fluffy coat: built when first asked for. Null at depth 0, which has no surface to coat. */
  volume: (() => Volume) | null;
  cap: Square;
  fit: Square | null;
  layout: string;
  left: number;
  top: number;
  transform: string;
  promoted: boolean;
  /** Last model-space bitmap painted on `canvas` when root motion is delegated to `wrap.style.transform`. */
  painted: PaintedState | null;
}

export function mountCanvas(el: HTMLElement, key: string, definition: AvatarDefinition, depth: number | undefined): CanvasSurface {
  const cap = avatarExtent(definition, depth);
  const wrap = document.createElement('div');
  // In flow at the content box, like the scene's root, so the host's padding and border place it.
  wrap.style.cssText = 'position:relative;width:100%;height:100%;pointer-events:none';
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:absolute';
  wrap.append(canvas);
  el.replaceChildren(wrap);
  let volume: Volume | undefined;
  return {
    key, wrap, canvas, ctx: canvas.getContext('2d'), cap, fit: null, layout: '', left: 0, top: 0, transform: '', promoted: false,
    volume: depth === 0 ? null : () => (volume ??= preparedVolume(definition, depth).vol),
    painted: null,
  };
}

/** The marks of `thinking` and `blocked`, which a frame lists as slices in place of the body. */
const isMark = (shape: FrameShape) => shape.key.startsWith('mark-');

function paintFrame(
  surface: CanvasSurface,
  frame: AvatarFrame,
  size: number,
  fill: string,
  ink: string,
  material: AvatarMaterial,
  delegateRoot: boolean,
  eyesKey: string,
) {
  const { canvas, ctx } = surface;
  if (!ctx || size <= 0) return;
  cancelDeferredCoat(surface);
  const dpr = window.devicePixelRatio || 1;
  const scale = (size / 100) * dpr;
  const layout = `${size}|${dpr}`;
  const finish = canvasMaterialOf(material);
  const { view, scale: bodyScale, eyes } = frame.surface;

  if (!delegateRoot) {
    surface.painted = null;
    setCanvasTransform(surface, '');
  }

  if (sections.size > MAX_SECTIONS) sections.clear();
  for (const { id, d, evenOdd, box, round } of frame.paths) {
    // A mark's part may come with another outline under its id (a host's mark is its own code): then it is made anew.
    const known = sections.get(id);
    if (!known || known.d !== d || known.round !== (round === true)) sections.set(id, { d, box, path: new Path2D(d), rule: evenOdd ? 'evenodd' : 'nonzero', round: round === true });
  }
  const paintRoot = delegateRoot ? IDENTITY : frame.root;
  const { matrices, bounds } = placementWith(frame, paintRoot);
  const volume = finish ? surface.volume : null;
  if (finish) {
    const margin = finish.margin ?? 0;
    bounds.x0 -= margin;
    bounds.y0 -= margin;
    bounds.x1 += margin;
    bounds.y1 += margin;
  }
  const fit = fitSquare(surface.layout === layout ? surface.fit : null, bounds, surface.cap);
  if (surface.layout === layout && fit === surface.fit) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  } else {
    // Whole device pixels to align the canvas box with the pixel grid. Setting width also clears it.
    surface.layout = layout;
    surface.fit = fit;
    surface.left = Math.floor(fit.x * scale);
    surface.top = Math.floor(fit.y * scale);
    const bitmap = Math.ceil(fit.size * scale) + 1;
    canvas.width = canvas.height = bitmap;
    const leftPx = surface.left / dpr;
    const topPx = surface.top / dpr;
    canvas.style.left = `${leftPx}px`;
    canvas.style.top = `${topPx}px`;
    canvas.style.width = canvas.style.height = `${bitmap / dpr}px`;
    // Anchor CSS root transforms at the viewBox (0, 0) origin without promoting `wrap` as a second layer.
    canvas.style.transformOrigin = `${-leftPx}px ${-topPx}px`;
  }

  // The whole body and its eyes as one image, unless it has shrunk away into a mark.
  const coat = finish && volume && bodyScale > 0.001
    ? finish.render(volume(), view, { color: fill, ink, eyes }, scale)
    : null;
  let coatPainted = false;
  ctx.lineCap = 'round';
  ctx.strokeStyle = ink;
  ctx.fillStyle = fill;
  // Shapes run in the thousands per second across a page: one setTransform each beats save/restore.
  for (let i = 0; i < frame.shapes.length; i++) {
    const shape = frame.shapes[i], m = matrices[i];
    ctx.setTransform(scale * m[0], scale * m[1], scale * m[2], scale * m[3], scale * m[4] - surface.left, scale * m[5] - surface.top);
    if (shape.kind === 'slice') {
      const section = sections.get(shape.path) as Section;
      if (isMark(shape)) {
        // In the material where it can draw the part, else as a plain fill.
        if (!finish || !paintMark(finish, ctx, section, scale, fill)) ctx.fill(section.path, section.rule);
      } else if (!coat) {
        ctx.fill(section.path, section.rule);
      } else if (!coatPainted) {
        // The body's slices follow one another: the coat takes the place of the first, under the root's motion.
        coatPainted = true;
        const [a, b, c, d, e, f] = paintRoot;
        ctx.setTransform(scale * a, scale * b, scale * c, scale * d, scale * e - surface.left, scale * f - surface.top);
        const radius = coat.radius * bodyScale;
        ctx.drawImage(coat.canvas, coat.x, coat.y, coat.size, coat.size, coat.cx - radius, coat.cy - radius, 2 * radius, 2 * radius);
      }
    } else if (shape.kind === 'eye') {
      if (coat) continue;
      ctx.fillStyle = ink;
      paintEye(ctx, shape.mark);
      ctx.fillStyle = fill;
    } else {
      const g = shape.gradient;
      const paint = ctx.createLinearGradient(g.x1, g.y1, g.x2, g.y2);
      const stops = g.stops;
      if (stops.length === 3) {
        paint.addColorStop(0, stops[0]);
        paint.addColorStop(0.5, stops[1]);
        paint.addColorStop(1, stops[2]);
      } else {
        for (let idx = 0; idx < stops.length; idx++) paint.addColorStop(idx / (stops.length - 1), stops[idx]);
      }
      ctx.fillStyle = paint;
      // Live frames supply numeric ribbon vertices via ribbonPointsOf; avatarFrame supplies SVG `d`.
      const pts = ribbonPointsOf(shape);
      if (pts && pts.length > 0) {
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fill(new Path2D(shape.d));
      }
      ctx.fillStyle = fill;
    }
  }

  if (delegateRoot && bodyScale > 0.001) {
    let rx = 35, ry = 35, rz = 12;
    if (surface.volume) {
      const vol = surface.volume();
      rx = (vol.bounds.maxX - vol.bounds.minX) / 2;
      ry = (vol.bounds.maxY - vol.bounds.minY) / 2;
      rz = 0;
      for (let i = 0; i < vol.parts.length; i++) if (vol.parts[i].depth / 2 > rz) rz = vol.parts[i].depth / 2;
    }
    // Store the requested `finish` and current `materialEpoch` so depth-0 fallbacks cache cleanly
    // while a restored WebGL2 context invalidates any flat fallback painted during context loss.
    surface.painted = { material: finish, epoch: materialEpoch, fill, ink, layout, bodyScale, eyesKey, view, rx, ry, rz };
    deferredCoats.delete(surface);
    coatPriority.delete(surface);
    setCanvasTransform(surface, rootCss(frame.root, size));
  }
}

/**
 * Paint one frame `size` CSS pixels wide directly into `surface.canvas` (baking `frame.root` into
 * the bitmap so `toDataURL()` and still exports capture the full pose). A material falls back to
 * flat where it cannot be drawn.
 */
export function paintCanvas(surface: CanvasSurface, frame: AvatarFrame, size: number, fill = frame.color, ink = frame.ink, material: AvatarMaterial = 'flat') {
  paintFrame(surface, frame, size, fill, ink, material, false, '');
}

/**
 * Live-avatar entry point: checks the retained bitmap cache from `transform` before materializing
 * the full `AvatarFrame`. When no overlays are active and the 3D view/eyes/look are within
 * sub-pixel tolerance, only `wrap.style.transform` is updated. Returns the current eye key so the
 * caller can track blinks/morphs without recomputing it.
 */
export function paintLiveCanvas(
  surface: CanvasSurface,
  transform: LiveTransform,
  size: number,
  fill: string,
  ink: string,
  material: AvatarMaterial = 'flat',
  frameTime = -1,
): { eyesKey: string; reused: boolean; deferred: boolean } {
  const eyesKey = eyesCacheKey(transform.eyes);
  if (!surface.ctx || size <= 0) return { eyesKey, reused: false, deferred: false };
  const finish = canvasMaterialOf(material);
  const dpr = window.devicePixelRatio || 1;
  const layout = `${size}|${dpr}`;

  if (!transform.hasOverlay) {
    const prev = surface.painted;
    if (
      prev &&
      prev.material === finish &&
      (finish === null || prev.epoch === materialEpoch) &&
      prev.fill === fill &&
      prev.ink === ink &&
      prev.layout === layout &&
      Math.abs(prev.bodyScale - 1) < 1e-4 &&
      prev.eyesKey === eyesKey
    ) {
      const shiftPx = viewShift(transform.view, prev.view, prev.rx, prev.ry, prev.rz) * (size / 100);
      if (shiftPx < VIEW_EPS_CSS_PX) {
        deferredCoats.delete(surface);
        coatPriority.delete(surface);
        setCanvasTransform(surface, rootCss(transform.root, size));
        return { eyesKey, reused: true, deferred: false };
      }
      // Strictly cap minor idle WebGL coat refreshes to MAX_IDLE_COATS_PER_FRAME per frame,
      // reserving the slots FIFO for the oldest deferred surfaces so none starve.
      if (finish && frameTime >= 0 && shiftPx < COAT_STAGGER_PX) {
        if (coatFrameTime !== frameTime) {
          // Any surface still in coatPriority didn't claim its slot on the previous frame (e.g. went
          // offscreen or became still); drop it so inactive surfaces can never block active ones.
          for (const stale of coatPriority) deferredCoats.delete(stale);
          coatFrameTime = frameTime;
          coatFrameCount = 0;
          coatPriority.clear();
          for (const s of deferredCoats) {
            if (coatPriority.size >= MAX_IDLE_COATS_PER_FRAME) break;
            coatPriority.add(s);
          }
        }
        const slotsLeft = MAX_IDLE_COATS_PER_FRAME - coatFrameCount;
        if (slotsLeft <= 0 || (!coatPriority.has(surface) && slotsLeft <= coatPriority.size)) {
          deferredCoats.add(surface);
          setCanvasTransform(surface, rootCss(transform.root, size));
          return { eyesKey, reused: true, deferred: true };
        }
        coatFrameCount++;
        deferredCoats.delete(surface);
        coatPriority.delete(surface);
      }
    }
  }

  paintFrame(surface, transform.buildFrame(), size, fill, ink, material, !transform.hasOverlay, eyesKey);
  return { eyesKey, reused: false, deferred: false };
}
