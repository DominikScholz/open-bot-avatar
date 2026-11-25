import { renderMetal } from '../metal/renderer.ts';
import type { CanvasMaterial } from './material.ts';

/** Opt-in metal finish. No WebGL context is created until the first render. */
export const metal: CanvasMaterial = {
  id: 'metal',
  margin: 3,
  render: (...args) => renderMetal(...args),
};
