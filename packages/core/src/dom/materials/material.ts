import type { FramePath, SurfaceEye, ViewBasis } from '../../render.ts';
import type { Volume } from '../../volume.ts';

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
  eyes: SurfaceEye[];
}

/**
 * A canvas finish supplied by the caller. Importing DOM mounting never imports a material.
 *
 * @experimental `fluffy` and `glass` are supported as values to pass. Writing a material of your
 * own is not yet: `render` is given the renderer's own model of the body and the view, which are
 * not part of the public API and may change in a minor release.
 */
export interface CanvasMaterial {
  readonly id: string;
  /** Extra room outside the body's projected bounds, in viewBox units. */
  readonly margin?: number;
  /** Return null where unavailable; the painter falls back to flat paths and eyes. */
  render(shape: Volume, view: ViewBasis, look: MaterialLook, scale: number): MaterialImage | null;
  /** Optional thinking/blocked marks. False leaves the original flat mark in place. */
  paintMark?(ctx: CanvasRenderingContext2D, box: FramePath['box'], scale: number, color: string): boolean;
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
