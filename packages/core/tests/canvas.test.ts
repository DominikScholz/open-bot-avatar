// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { mountAvatar } from '../src/dom/mount.ts';
import { examples } from '../src/examples.ts';
import { avatarExtent } from '../src/render.ts';

/** jsdom has no canvas: a 2D context that records what is painted, with the style in effect. */
interface Recorder {
  calls: { op: string; fill: string; stroke: string }[];
}
let withRoundRect = true;
const recorders = new WeakMap<HTMLCanvasElement, Recorder>();

beforeAll(() => {
  (globalThis as { Path2D?: unknown }).Path2D = class {
    constructor(public d?: string) {}
  };
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
    const rec: Recorder = { calls: [] };
    recorders.set(this, rec);
    const ctx: Record<string, unknown> = { fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, lineCap: 'butt' };
    for (const op of ['setTransform', 'clearRect', 'fill', 'stroke', 'beginPath', 'moveTo', 'arcTo', 'closePath']) {
      ctx[op] = () => rec.calls.push({ op, fill: String(ctx.fillStyle), stroke: String(ctx.strokeStyle) });
    }
    if (withRoundRect) ctx.roundRect = () => rec.calls.push({ op: 'roundRect', fill: String(ctx.fillStyle), stroke: String(ctx.strokeStyle) });
    return ctx as unknown as CanvasRenderingContext2D;
  } as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

const tick = () => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
/** Small avatars redraw at 30 fps, so a change can take two animation frames to show. */
const frame = async () => {
  for (let i = 0; i < 3; i++) await tick();
};

function host(width = 96) {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: width });
  document.body.append(el);
  return el;
}
const painted = (el: HTMLElement) => recorders.get(el.querySelector('canvas') as HTMLCanvasElement)?.calls ?? [];

describe('mountAvatar on a canvas', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    withRoundRect = true;
  });

  it('paints a live avatar to one canvas by default, in a wrapper at the content box', async () => {
    const el = host();
    const avatar = mountAvatar(el, { definition: examples[0], color: '#1f7cf2' });
    await frame();
    const canvas = el.querySelector('canvas') as HTMLCanvasElement;
    expect(el.querySelector('[data-avatar-scene]')).toBeNull();
    expect(el.querySelectorAll('*').length).toBe(2);
    expect(canvas.parentElement?.parentElement).toBe(el);
    expect(canvas.parentElement?.style.position).toBe('relative');
    const fills = painted(el).filter((c) => c.op === 'fill');
    expect(fills.length).toBeGreaterThan(5);
    expect(fills[0].fill).toBe('#1f7cf2');
    expect(el.getAttribute('role')).toBe('img');
    avatar.destroy();
    expect(el.innerHTML).toBe('');
  });

  it('sizes the bitmap to what is painted, well inside the extent', async () => {
    const el = host(100);
    const avatar = mountAvatar(el, { definition: examples[1], reducedMotion: true });
    await frame();
    const canvas = el.querySelector('canvas') as HTMLCanvasElement;
    const extent = avatarExtent(examples[1]);
    expect(canvas.width).toBeGreaterThan(90);
    expect(canvas.width ** 2).toBeLessThan(0.55 * extent.size ** 2);
    avatar.destroy();
  });

  it('switches between canvas, scene and still', async () => {
    const el = host();
    const avatar = mountAvatar(el, { definition: examples[2], renderer: 'scene' });
    await frame();
    expect(el.querySelector('[data-avatar-scene]')).not.toBeNull();
    avatar.update({ renderer: 'canvas' });
    await frame();
    expect(el.querySelector('[data-avatar-scene]')).toBeNull();
    expect(el.querySelectorAll('canvas').length).toBe(1);
    avatar.update({ still: true });
    await frame();
    expect(el.querySelector('canvas')).toBeNull();
    expect(el.querySelector('svg > title')).not.toBeNull();
    avatar.update({ still: false });
    await frame();
    expect(el.querySelectorAll('canvas').length).toBe(1);
    avatar.destroy();
    expect(el.innerHTML).toBe('');
  });

  it('takes any CSS color, like the scene', async () => {
    const el = host();
    const avatar = mountAvatar(el, { definition: examples[3], color: 'rgb(0 128 255)', eyeColor: 'red', reducedMotion: true });
    await frame();
    const calls = painted(el);
    expect(calls.find((c) => c.op === 'fill')?.fill).toBe(getComputedStyle(el).color);
    expect(calls.find((c) => c.op === 'fill')?.fill).not.toBe('#ff6a1a');
    expect(calls.find((c) => c.op === 'roundRect')?.fill).toBe('red');
    avatar.destroy();
  });

  it('draws pill eyes without roundRect', async () => {
    withRoundRect = false;
    const el = host();
    const avatar = mountAvatar(el, { definition: examples[0], reducedMotion: true });
    await frame();
    expect(painted(el).filter((c) => c.op === 'arcTo').length).toBe(8);
    avatar.destroy();
  });
});
