import { renderFluffy } from '../fluffy/renderer.ts';
import type { CanvasMaterial } from './material.ts';

/** Opt-in fluffy finish. No WebGL context is created until the first render. */
export const fluffy: CanvasMaterial = {
  id: 'fluffy',
  margin: 3,
  render: (...args) => renderFluffy(...args),
};
