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

/** A canvas finish supplied by the caller. Importing DOM mounting never imports a material. */
export interface CanvasMaterial {
  readonly id: string;
  /** Extra room outside the body's projected bounds, in viewBox units. */
  readonly margin?: number;
  /** Return null where unavailable; the painter falls back to flat paths and eyes. */
  render(shape: Volume, view: ViewBasis, look: MaterialLook, scale: number): MaterialImage | null;
  /** Optional thinking/blocked marks. False leaves the original flat mark in place. */
  paintMark?(ctx: CanvasRenderingContext2D, box: FramePath['box'], scale: number, color: string): boolean;
}
