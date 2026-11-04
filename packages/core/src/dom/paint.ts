/**
 * The canvas renderer: paints flat avatar frames to one canvas, so an avatar
 * costs one compositor layer and a small bitmap however many slices it shows.
 * The canvas overhangs the host by the avatar's reach and ignores the pointer.
 * Equal geometry shares its parsed paths across avatars.
 */
import { avatarExtent } from '../render.ts';
import type { AvatarFrame, EyeMark } from '../render.ts';
import type { AvatarDefinition } from '../types.ts';

interface Section {
  path: Path2D;
  rule: CanvasFillRule;
}

const MAX_SECTIONS = 4096;
const sections = new Map<string, Section>();

function eye(ctx: CanvasRenderingContext2D, mark: EyeMark) {
  if (mark.shape === 'arc') {
    ctx.lineWidth = mark.strokeWidth;
    ctx.stroke(new Path2D(mark.d));
    return;
  }
  ctx.beginPath();
  ctx.roundRect(mark.x, mark.y, mark.width, mark.height, mark.radius);
  ctx.fill();
}

/** `scale` is device pixels per viewBox unit; (`x`, `y`) is the canvas origin in device pixels from the box's origin. */
function paintFrame(ctx: CanvasRenderingContext2D, frame: AvatarFrame, scale: number, x: number, y: number) {
  if (sections.size > MAX_SECTIONS) sections.clear();
  for (const { id, d, evenOdd } of frame.paths) {
    if (!sections.has(id)) sections.set(id, { path: new Path2D(d), rule: evenOdd ? 'evenodd' : 'nonzero' });
  }

  const [ra, rb, rc, rd, re, rf] = frame.root;
  ctx.lineCap = 'round';
  ctx.strokeStyle = frame.ink;
  ctx.fillStyle = frame.color;
  // Shapes run in the thousands per second across a page: one setTransform each beats save/restore.
  for (const shape of frame.shapes) {
    const [a, b, c, d, e, f] = shape.matrix;
    ctx.setTransform(
      scale * (ra * a + rc * b),
      scale * (rb * a + rd * b),
      scale * (ra * c + rc * d),
      scale * (rb * c + rd * d),
      scale * (ra * e + rc * f + re) - x,
      scale * (rb * e + rd * f + rf) - y,
    );
    if (shape.kind === 'slice') {
      const section = sections.get(shape.path) as Section;
      ctx.fill(section.path, section.rule);
    } else {
      ctx.fillStyle = frame.ink;
      eye(ctx, shape.mark);
      ctx.fillStyle = frame.color;
    }
  }
}

/** A mounted canvas and the size its bitmap was last laid out at. */
export interface CanvasSurface {
  key: string;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | null;
  extent: { x: number; y: number; size: number };
  layout: string;
  left: number;
  top: number;
}

export function mountCanvas(el: HTMLElement, key: string, definition: AvatarDefinition, depth: number | undefined): CanvasSurface {
  const extent = avatarExtent(definition, depth);
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:absolute;pointer-events:none';
  el.replaceChildren(canvas);
  return { key, canvas, ctx: canvas.getContext('2d'), extent, layout: '', left: 0, top: 0 };
}

export function paintCanvas(surface: CanvasSurface, frame: AvatarFrame, size: number) {
  const { canvas, ctx, extent } = surface;
  if (!ctx || size <= 0) return;
  const dpr = window.devicePixelRatio || 1;
  const scale = (size / 100) * dpr;
  const layout = `${size}|${dpr}`;
  if (surface.layout === layout) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  } else {
    // Whole device pixels, so the bitmap is never resampled. Setting the width also clears it.
    surface.layout = layout;
    surface.left = Math.floor(extent.x * scale);
    surface.top = Math.floor(extent.y * scale);
    const bitmap = Math.ceil(extent.size * scale) + 1;
    canvas.width = canvas.height = bitmap;
    canvas.style.left = `${surface.left / dpr}px`;
    canvas.style.top = `${surface.top / dpr}px`;
    canvas.style.width = canvas.style.height = `${bitmap / dpr}px`;
  }
  paintFrame(ctx, frame, scale, surface.left, surface.top);
}
