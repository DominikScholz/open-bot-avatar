// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { mountAvatar } from '../src/dom/mount.ts';
import { examples } from '../src/examples.ts';
import { mountCanvas, paintCanvas } from '../src/dom/paint.ts';
import * as fluffy from '../src/dom/fluffy/renderer.ts';
import { avatarExtent, liveFrame } from '../src/render.ts';

/** jsdom has no canvas: a 2D context that records what is painted, with the style in effect. */
interface Recorder {
  calls: { op: string; fill: string; stroke: string; args: unknown[] }[];
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
    for (const op of ['setTransform', 'clearRect', 'drawImage', 'fill', 'stroke', 'beginPath', 'moveTo', 'arcTo', 'closePath']) {
      ctx[op] = (...args: unknown[]) => rec.calls.push({ op, fill: String(ctx.fillStyle), stroke: String(ctx.strokeStyle), args });
    }
    if (withRoundRect) ctx.roundRect = () => rec.calls.push({ op: 'roundRect', fill: String(ctx.fillStyle), stroke: String(ctx.strokeStyle), args: [] });
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

  it('paints a fluffy still once, and again when its color or material changes', async () => {
    const tile = document.createElement('canvas');
    const render = vi.spyOn(fluffy, 'renderFluffy').mockReturnValue({ canvas: tile, x: 0, y: 0, size: 64, cx: 50, cy: 50, radius: 24 });
    const el = host();
    const avatar = mountAvatar(el, { definition: examples[0], material: 'fluffy', still: true, color: '#1f7cf2', eyeColor: '#151515' });
    try {
      await frame();
      expect(painted(el).filter(call => call.op === 'drawImage')).toHaveLength(1);
      await frame();
      expect(render).toHaveBeenCalledTimes(1);
      avatar.update({ color: '#ec4899' });
      await frame();
      expect(render.mock.lastCall?.[2].color).toBe('#ec4899');
      avatar.update({ material: 'flat' });
      await frame();
      expect(el.querySelector('svg')).not.toBeNull();
      avatar.update({ material: 'fluffy' });
      await frame();
      expect(el.querySelector('canvas')).not.toBeNull();
    } finally {
      avatar.destroy();
      render.mockRestore();
    }
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

  it('paints fluffy marks from one sprite through a hop, and fills them where fluffy is unavailable', () => {
    const tile = document.createElement('canvas');
    const render = vi.spyOn(fluffy, 'renderFluffy').mockReturnValue({ canvas: tile, x: 0, y: 0, size: 64, cx: 0, cy: 0, radius: 24 });
    try {
      const def = examples[0], el = host();
      const surface = mountCanvas(el, 'marks', def, 6);
      const markFrame = (state: 'thinking' | 'blocked', time: number) => liveFrame(def, { state, time, size: 96 });
      for (const time of [0, .2]) paintCanvas(surface, markFrame('thinking', time), 96, '#589df2', '#151515', 'fluffy');
      expect(render).toHaveBeenCalledTimes(1);
      expect(painted(el).filter(call => call.op === 'drawImage')).toHaveLength(6);

      render.mockReturnValue(null);
      paintCanvas(surface, markFrame('blocked', 0), 96, '#7757f2', '#151515', 'fluffy');
      expect(painted(el).filter(call => call.op === 'fill')).toHaveLength(2);
    } finally {
      render.mockRestore();
    }
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

describe('a mark of the host\'s own on a canvas', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });
  const square = (d: string, extra: object = {}) => ({ shape: 'q', d, box: { x: -9, y: -9, w: 18, h: 18 }, x: 0, y: 0, turn: 0, scale: 1, ...extra });
  const showing = (...parts: ReturnType<typeof square>[]) => ({ id: 'custom', pose: () => ({ marks: [{ mark: { id: 'custom', parts: () => parts }, weight: 1 }] }) });
  const fills = (el: HTMLElement) => painted(el).filter((c) => c.op === 'fill').map((c) => (c.args[0] as { d: string }).d);

  it('is filled with the outline it has now, when the outline under a name changes', () => {
    const el = host();
    const surface = mountCanvas(el, 'custom', examples[0], 6);
    paintCanvas(surface, liveFrame(examples[0], { state: showing(square('M-9 -9H9V9H-9Z')), size: 96 }), 96);
    expect(fills(el)).toEqual(['M-9 -9H9V9H-9Z']);
    paintCanvas(surface, liveFrame(examples[0], { state: showing(square('M-5 -9H5V9H-5Z')), size: 96 }), 96);
    expect(fills(el)).toEqual(['M-9 -9H9V9H-9Z', 'M-5 -9H5V9H-5Z']);
    // Two outlines under one name in one frame are both drawn.
    paintCanvas(surface, liveFrame(examples[0], { state: showing(square('M-9 -9H9V9H-9Z'), square('M-2 -2H2V2H-2Z')), size: 96 }), 96);
    expect(fills(el).slice(2)).toEqual(['M-9 -9H9V9H-9Z', 'M-2 -2H2V2H-2Z']);
  });

  it('is drawn in fluffy as a ball where it says it is round and in its own shape where not, and filled where fluffy is unavailable', () => {
    const tile = document.createElement('canvas');
    const render = vi.spyOn(fluffy, 'renderFluffy').mockReturnValue({ canvas: tile, x: 0, y: 0, size: 64, cx: 50, cy: 50, radius: 30 });
    try {
      const el = host();
      const surface = mountCanvas(el, 'custom', examples[0], 6);
      const draws = () => painted(el).filter((c) => c.op === 'drawImage');
      // Not round: a volume built from the outline, drawn about the outline's own centre.
      paintCanvas(surface, liveFrame(examples[0], { state: showing(square('M-9 -9H9V9H-9Z')), size: 96 }), 96, '#589df2', '#151515', 'fluffy');
      expect(render).toHaveBeenCalledTimes(1);
      expect('parts' in render.mock.lastCall![0]).toBe(true);
      expect(render.mock.lastCall![2]).toEqual({ color: '#589df2', ink: '#589df2', eyes: [] });
      const [, x, y, w, h] = draws()[0].args as number[];
      expect(w).toBeCloseTo(h);
      expect(x + w / 2).toBeCloseTo(0);
      expect(y + h / 2).toBeCloseTo(0);
      // The square is 18 across; the image reaches 30 model units to each side of a model up to 84 across.
      expect(w).toBeGreaterThan(18 * (60 / 84) - 0.01);
      expect(fills(el)).toEqual([]);
      // Round: the ready capsule (in a color no other test has a sprite of).
      paintCanvas(surface, liveFrame(examples[0], { state: showing({ ...square('M9 0A9 9 0 1 1 -9 0A9 9 0 1 1 9 0Z', { round: true }), shape: 'ball' }), size: 96 }), 96, '#0a0b0c', '#151515', 'fluffy');
      expect(render).toHaveBeenCalledTimes(2);
      expect('radius' in render.mock.lastCall![0]).toBe(true);
      expect(draws()).toHaveLength(2);
      // Unavailable: the outline is filled.
      render.mockReturnValue(null);
      paintCanvas(surface, liveFrame(examples[0], { state: showing(square('M-7 -9H7V9H-7Z')), size: 96 }), 96, '#123456', '#151515', 'fluffy');
      expect(fills(el)).toEqual(['M-7 -9H7V9H-7Z']);
    } finally {
      render.mockRestore();
    }
  });
});
