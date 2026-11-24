// Browser entry for bake-thumbnails.mjs. Each cell has the same 100-unit frame as its selection ring.
import { examples } from 'open-bot-avatar';
import { liveFrame } from '../../../packages/core/src/render.ts';
import { mountCanvas, paintCanvas } from '../../../packages/core/src/dom/paint.ts';
import { GALLERY } from '../src/gallery';
import { defaultColor } from '../src/studio/look';
import { thumbnailKey, THUMB_LOOK, THUMB_VIEW } from '../src/studio/outline';

const avatars = [...examples, ...GALLERY].sort((a, b) => a.id.localeCompare(b.id, 'en'));
const side = Math.ceil(Math.sqrt(avatars.length));
const cell = 160;
const atlas = document.createElement('canvas');
atlas.width = atlas.height = side * cell;
const ctx = atlas.getContext('2d')!;
const keys = avatars.map((definition, i) => {
  const color = defaultColor(definition.id);
  const frame = liveFrame(definition, { size: cell, reducedMotion: true, view: THUMB_VIEW, gaze: THUMB_LOOK });
  const surface = mountCanvas(document.createElement('div'), definition.id, definition, undefined);
  paintCanvas(surface, frame, cell, color, frame.ink, 'fluffy');
  const x = (i % side) * cell, y = Math.floor(i / side) * cell;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, cell, cell);
  ctx.clip();
  ctx.drawImage(surface.canvas, x + surface.left, y + surface.top);
  ctx.restore();
  // A flat fallback would leave the atlas without fur.
  const pixels = ctx.getImageData(x, y, cell, cell).data;
  const colors = new Set<number>();
  for (let j = 0; j < pixels.length; j += 4) {
    if (pixels[j + 3] === 255) colors.add((pixels[j] << 16) | (pixels[j + 1] << 8) | pixels[j + 2]);
  }
  if (colors.size < 32) throw new Error('Could not render fluffy for ' + definition.id);
  return thumbnailKey(definition, color);
});
document.body.textContent = JSON.stringify({ keys, image: atlas.toDataURL('image/webp', .97).split(',')[1] });
