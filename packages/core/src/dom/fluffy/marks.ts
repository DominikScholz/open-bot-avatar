/**
 * The marks of a state in fluffy. A part that is a ball or a capsule (the three dots, both parts
 * of the exclamation mark) is a small pompom from a ready model; any other outline gets a coat
 * of its own, from a volume built from the outline as an avatar's body is. Either is rendered
 * once per shape, color and size and kept as a sprite, since a mark only ever moves, squashes
 * and fades.
 */
import { flattenPath, parsePath, serializePath, type Segment } from '../../path.ts';
import { viewBasis, type FramePath } from '../../render.ts';
import { buildVolume, type Volume } from '../../volume.ts';
import type { Capsule } from './mesh.ts';
import { renderFluffy } from './renderer.ts';

/** Radius of a mark's model, viewBox units: enough for the short pile to read on a small dot. */
const RADIUS = 12;
const FRONT = viewBasis(0, 0);
/** Sprites are rendered a little larger than they are drawn, for the top of a hop. */
const HEADROOM = 1.12;

const models = new Map<number, Capsule>();
const sprites = new Map<string, Sprite>();
/** A rendered mark: its image, and the square it covers in its model's units (`radius` to each side of (cx, cy)). */
interface Sprite { canvas: HTMLCanvasElement; cx: number; cy: number; radius: number }
const MAX_SPRITES = 32;

/**
 * Paint a mark face-on as a fluffy ball or capsule filling `box`, under the context's transform
 * (which animates it). `scale` is device pixels per viewBox unit. False where fluffy can't be
 * drawn: the caller fills the mark's path instead.
 */
export function paintFluffyMark(ctx: CanvasRenderingContext2D, box: FramePath['box'], scale: number, color: string): boolean {
  const aspect = Math.round((1000 * box.h) / box.w) / 1000;
  let model = models.get(aspect);
  if (!model) {
    const halfHeight = RADIUS * aspect;
    model = { radius: RADIUS, bounds: { minX: -RADIUS, maxX: RADIUS, minY: -halfHeight, maxY: halfHeight } };
    models.set(aspect, model);
  }
  /** Drawn units per model unit. */
  const unit = box.w / (2 * RADIUS);
  // Whole powers of two, so a mark that grows or shrinks keeps the same fibers.
  const density = Math.min(8, Math.max(0.5, 2 ** Math.ceil(Math.log2(HEADROOM * scale * unit))));
  const sprite = spriteOf(`${aspect}|${color}|${density}`, model, color, density);
  if (!sprite) return false;
  const radius = sprite.radius * unit;
  ctx.drawImage(sprite.canvas, -radius, -radius, 2 * radius, 2 * radius);
  return true;
}

/** The sprite of a model in a color at a density (device pixels per model unit), rendered when first asked for. */
function spriteOf(key: string, model: Capsule | Volume, color: string, density: number): Sprite | null {
  let sprite = sprites.get(key);
  if (sprite) return sprite;
  const image = renderFluffy(model, FRONT, { color, ink: color, eyes: [] }, density);
  if (!image) return null;
  // The renderer's canvas is shared with the body: keep a copy.
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = image.size;
  const copy = canvas.getContext('2d');
  if (!copy) return null;
  copy.drawImage(image.canvas, image.x, image.y, image.size, image.size, 0, 0, image.size, image.size);
  sprite = { canvas, cx: image.cx, cy: image.cy, radius: image.radius };
  if (sprites.size >= MAX_SPRITES) sprites.delete(sprites.keys().next().value!);
  sprites.set(key, sprite);
  return sprite;
}

/**
 * An outline as a model: a volume in the 100-unit box an avatar's body is built in, the outline's
 * box centred on CENTRE, `scale` model units to one of the outline's own.
 */
interface OutlineModel { key: string; volume: Volume; scale: number; cx: number; cy: number }
const CENTRE = 50;
/** The larger side of an outline's box is at most this long in its model, units. */
const FIT = 84;
/** Models by outline, and by the model's own path: one outline at two sizes is one model. */
const outlines = new Map<string, OutlineModel | null>();
const volumes = new Map<string, Volume>();
const MAX_OUTLINES = 64;

/**
 * The model of an outline, or null for one no volume can be built from. Its stroke is made as
 * wide as a capsule's model (twice RADIUS), so the pile reads on it as it does on the built-in
 * marks: the width of the stroke is taken as twice the outline's area over its length round.
 */
export function outlineModel(d: string, box: FramePath['box']): OutlineModel | null {
  const known = outlines.get(d);
  if (known !== undefined) return known;
  let model: OutlineModel | null = null;
  try {
    const segs = parsePath(d, false);
    let area = 0, round = 0;
    for (const poly of flattenPath(segs)) {
      let twice = 0;
      poly.forEach(([x, y], i) => {
        const [nx, ny] = poly[(i + 1) % poly.length];
        twice += x * ny - nx * y;
        round += Math.hypot(nx - x, ny - y);
      });
      area += twice / 2;
    }
    const stroke = (2 * Math.abs(area)) / round;
    const scale = Math.min((2 * RADIUS) / stroke, FIT / Math.max(box.w, box.h));
    if (stroke > 0 && Number.isFinite(scale)) {
      const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
      const X = (x: number) => CENTRE + (x - cx) * scale, Y = (y: number) => CENTRE + (y - cy) * scale;
      const key = serializePath(segs.map((s): Segment => {
        if (s.c === 'Z') return s;
        if (s.c === 'A') return { ...s, rx: s.rx * scale, ry: s.ry * scale, x: X(s.x), y: Y(s.y) };
        if (s.c === 'C') return { ...s, x1: X(s.x1), y1: Y(s.y1), x2: X(s.x2), y2: Y(s.y2), x: X(s.x), y: Y(s.y) };
        if (s.c === 'Q') return { ...s, x1: X(s.x1), y1: Y(s.y1), x: X(s.x), y: Y(s.y) };
        return { ...s, x: X(s.x), y: Y(s.y) };
      }));
      let volume = volumes.get(key);
      if (!volume) {
        // A mark has no eyes: the volume only needs somewhere to put them.
        volume = buildVolume({ version: 1, id: 'mark', name: 'mark', body: { path: key }, eyes: { x: CENTRE, y: CENTRE, spacing: 10, scale: 1 } });
        if (volumes.size >= MAX_OUTLINES) volumes.delete(volumes.keys().next().value!);
        volumes.set(key, volume);
      }
      model = { key, volume, scale, cx, cy };
    }
  } catch {
    model = null;
  }
  if (outlines.size >= MAX_OUTLINES) outlines.delete(outlines.keys().next().value!);
  outlines.set(d, model);
  return model;
}

/**
 * Paint a mark's part of any outline `d` as a coat of fur in its shape, under the context's
 * transform (which animates it). `scale` is device pixels per viewBox unit. False where fluffy
 * can't be drawn or the outline can't be built into a volume: the caller fills the path instead.
 */
export function paintFluffyOutline(ctx: CanvasRenderingContext2D, d: string, box: FramePath['box'], scale: number, color: string): boolean {
  const model = outlineModel(d, box);
  if (!model) return false;
  // Whole powers of two, so a mark that grows or shrinks keeps the same fibers.
  const density = Math.min(8, Math.max(0.5, 2 ** Math.ceil(Math.log2((HEADROOM * scale) / model.scale))));
  const sprite = spriteOf(`${model.key}|${color}|${density}`, model.volume, color, density);
  if (!sprite) return false;
  const radius = sprite.radius / model.scale;
  ctx.drawImage(sprite.canvas, model.cx + (sprite.cx - CENTRE) / model.scale - radius, model.cy + (sprite.cy - CENTRE) / model.scale - radius, 2 * radius, 2 * radius);
  return true;
}
