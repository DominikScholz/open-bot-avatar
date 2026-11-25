import type { SurfaceEye, ViewBasis } from '../../render.ts';
import type { MaterialShape } from './shape.ts';

/** An image valid until the next render; the canvas painter copies it immediately. */
export interface MaterialImage {
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
  size: number;
  cx: number;
  cy: number;
  radius: number;
}

export interface MaterialLook {
  color: string;
  ink: string;
  accents?: string[];
  eyes: SurfaceEye[];
}

/**
 * A canvas finish supplied by the caller. Importing DOM mounting never imports a material.
 *
 * A material is one function: it renders a shape, seen from a view, to an image. The painter asks
 * it for the body (a Volume, with the eyes to set into it) and for each part of a state's mark (a
 * Capsule for a ball or a bar, a Volume for any other outline, no eyes), and does the rest: it
 * places the images, keeps the marks as sprites and draws the ribbons.
 *
 * @experimental `fluffy` and `glass` are supported as values to pass. Writing a material of your
 * own is not yet: `render` is given the renderer's own model of a shape and of the view, which are
 * not part of the public API and may change in a minor release.
 */
export interface CanvasMaterial {
  readonly id: string;
  /** Extra room outside the body's projected bounds, in viewBox units. */
  readonly margin?: number;
  /**
   * Render `shape` at `scale` device pixels per viewBox unit. Return null where the material is
   * unavailable or does not draw this kind of shape; the painter falls back to flat paths and eyes.
   */
  render(shape: MaterialShape, view: ViewBasis, look: MaterialLook, scale: number): MaterialImage | null;
}

/** A flat fill (default), or an explicitly imported canvas material (see AvatarOptions). */
export type AvatarMaterial = 'flat' | CanvasMaterial;

/** Where each built-in material is imported from, for a host that still passes its name. */
const ENTRIES: Record<string, string> = { fluffy: 'open-bot-avatar/materials/fluffy', glass: 'open-bot-avatar/materials/glass' };
const warned = new Set<string>();

/**
 * The material to paint with, or null for flat. A material is a value now, where it once was a
 * name: a value that is neither 'flat' nor a material (the old `material: "fluffy"`, a name read
 * back from storage) draws flat, and says so once.
 */
export function canvasMaterialOf(material: unknown): CanvasMaterial | null {
  if (material === undefined || material === null || material === 'flat') return null;
  if (typeof material === 'object' && material !== null && typeof (material as CanvasMaterial).render === 'function') return material as CanvasMaterial;
  const name = typeof material === 'string' ? JSON.stringify(material) : typeof material;
  if (!warned.has(name) && warned.size < 16) {
    warned.add(name);
    const entry = typeof material === 'string' ? ENTRIES[material] : undefined;
    console.warn(
      `open-bot-avatar: material ${name} is not a material, drawing flat. ` +
        (entry ? `Import { ${material} } from "${entry}" and pass it as \`material\`.` : 'Pass "flat" or an imported material, such as { fluffy } from "open-bot-avatar/materials/fluffy".'),
    );
  }
  return null;
}
