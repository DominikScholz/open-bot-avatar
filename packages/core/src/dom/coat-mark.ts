import { viewBasis, type FramePath } from '../render.ts';
import type { CoatCapsule } from './coat-mesh.ts';
import { renderCoat, type CoatLighting } from './plush.ts';

// Give the short pile enough room to read on a small dot. The frame supplies
// the displayed width and height, including the avatar's own mark sizing.
const RADIUS = 12;
const front = viewBasis(0, 0);
const models = new Map<number, CoatCapsule>();
const sprites = new Map<string, { canvas: HTMLCanvasElement; radius: number }>();

/** Paint a face-on pompom or capsule with the body shader. The frame's transform animates it. */
export function paintCoatMark(
  ctx: CanvasRenderingContext2D, box: FramePath['box'], scale: number,
  color: string, lighting: CoatLighting = 'current',
): boolean {
  const aspect = Math.round(1000 * box.h / box.w) / 1000;
  let model = models.get(aspect);
  if (!model) {
    const halfHeight = RADIUS * aspect;
    model = { radius: RADIUS, bounds: { minX: -RADIUS, maxX: RADIUS, minY: -halfHeight, maxY: halfHeight } };
    models.set(aspect, model);
  }

  const unit = box.w / (2 * RADIUS);
  // Size for the full hop. A bouncing or shrinking dot reuses the same fibers.
  const density = Math.min(8, Math.max(.5, 2 ** Math.ceil(Math.log2(1.12 * scale * unit))));
  const key = [aspect, lighting, color, density].join('|');
  let sprite = sprites.get(key);
  if (!sprite) {
    const render = renderCoat(model, front, color, density, color, [], lighting);
    if (!render) return false;
    // The WebGL buffer is shared with the body. Keep a detached copy for the
    // three dots and for frames that show the body and a mark together.
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = render.canvas.width;
    const copy = canvas.getContext('2d');
    if (!copy) return false;
    copy.drawImage(render.canvas, 0, 0);
    sprite = { canvas, radius: render.radius };
    if (sprites.size >= 12) sprites.delete(sprites.keys().next().value!);
    sprites.set(key, sprite);
  }
  const radius = sprite.radius * unit;
  ctx.drawImage(sprite.canvas, -radius, -radius, 2 * radius, 2 * radius);
  return true;
}
