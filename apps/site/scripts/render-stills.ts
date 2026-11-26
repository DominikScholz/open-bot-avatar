// Browser entry for artwork.ts: one still per entry of `window.input`, as PNGs, drawn by the
// canvas renderer the studio uses. Flat and fluffy stills of the same pose lie exactly over each other.
import { examples, type AvatarDefinition, type RenderOptions } from 'open-bot-avatar';
import { liveFrame } from '../../../packages/core/src/render.ts';
import { mountCanvas, paintCanvas } from '../../../packages/core/src/dom/paint.ts';
import { fluffy } from '../../../packages/core/src/dom/materials/fluffy.ts';
import { glass } from '../../../packages/core/src/dom/materials/glass.ts';
import { matte } from '../../../packages/core/src/dom/materials/matte.ts';
import { GALLERY } from '../src/gallery';

export interface StillSpec extends RenderOptions {
  /** A starter's or gallery avatar's id. */
  id: string;
  color: string;
  size: number;
  /** By name: the specs cross to the page as JSON. */
  material: keyof typeof MATERIALS;
}

const MATERIALS = { flat: 'flat', fluffy, glass, matte } as const;

/** A still and where its canvas sits against the avatar's box, in the still's own CSS pixels. */
export interface Still { png: string; left: number; top: number; width: number; height: number }

const byId = new Map<string, AvatarDefinition>([...examples, ...GALLERY].map((d) => [d.id, d]));

const stills = (window as unknown as { input: StillSpec[] }).input.map(({ id, color, material, ...options }, i): Still => {
  const definition = byId.get(id);
  if (!definition) throw new Error('unknown avatar ' + id);
  const frame = liveFrame(definition, options);
  const surface = mountCanvas(document.createElement('div'), `${id}-${i}`, definition, undefined);
  paintCanvas(surface, frame, options.size, color, frame.ink, MATERIALS[material]);
  const ratio = window.devicePixelRatio;
  return { png: surface.canvas.toDataURL('image/png'), left: surface.left / ratio, top: surface.top / ratio, width: surface.canvas.width / ratio, height: surface.canvas.height / ratio };
});
document.body.textContent = JSON.stringify({ stills });
