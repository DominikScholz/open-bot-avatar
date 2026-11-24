import { renderGlass } from '../glass/renderer.ts';
import { paintGlassMark } from '../glass/marks.ts';
import type { CanvasMaterial } from './material.ts';

/** Opt-in glass finish. No WebGL context is created until the first render. */
export const glass: CanvasMaterial = {
  id: 'glass',
  margin: 3,
  render: (...args) => renderGlass(...args),
  paintMark: (...args) => paintGlassMark(...args),
};
