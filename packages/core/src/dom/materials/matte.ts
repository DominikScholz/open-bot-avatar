import { renderFluffy } from '../fluffy/renderer.ts';
import type { CanvasMaterial } from './material.ts';

/**
 * Opt-in matte finish: the body lit like clay, soft and without shine. It shares fluffy's renderer
 * (one WebGL context, the same mesh and eye sockets) and draws the body without the pile. No WebGL
 * context is created until the first render.
 */
export const matte: CanvasMaterial = {
  id: 'matte',
  render: (shape, view, look, scale) => renderFluffy(shape, view, look, scale, 'matte'),
};
