// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { mountAvatar } from '../src/dom/mount.ts';
import { examples } from '../src/examples.ts';
import { mountCanvas, paintCanvas } from '../src/dom/paint.ts';
import { glass as glassMaterial } from '../src/dom/materials/glass.ts';
import * as glass from '../src/dom/glass/renderer.ts';
import type { CanvasMaterial } from '../src/dom/materials/material.ts';
import { fluffy as fluffyMaterial } from '../src/dom/materials/fluffy.ts';
import * as fluffy from '../src/dom/fluffy/renderer.ts';
import { avatarExtent, liveFrame } from '../src/render.ts';

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
    for (const op of ['setTransform', 'clearRect', 'drawImage', 'fill', 'stroke', 'beginPath', 'moveTo', 'arcTo', 'closePath']) {
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

  it('paints a fluffy still once, and again when its color or material changes', async () => {
    const tile = document.createElement('canvas');
    const render = vi.spyOn(fluffy, 'renderFluffy').mockReturnValue({ canvas: tile, x: 0, y: 0, size: 64, cx: 50, cy: 50, radius: 24 });
    const el = host();
    const avatar = mountAvatar(el, { definition: examples[0], material: fluffyMaterial, still: true, color: '#1f7cf2', eyeColor: '#151515' });
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
      avatar.update({ material: fluffyMaterial });
      await frame();
      expect(el.querySelector('canvas')).not.toBeNull();
    } finally {
      avatar.destroy();
      render.mockRestore();
    }
  });

  it('switches imported materials on a still and preserves the flat fallback', async () => {
    const tile = document.createElement('canvas');
    const image = { canvas: tile, x: 0, y: 0, size: 64, cx: 50, cy: 50, radius: 24 };
    const renderGlass = vi.spyOn(glass, 'renderGlass').mockReturnValue(image);
    const renderFluffy = vi.spyOn(fluffy, 'renderFluffy').mockReturnValue(image);
    const el = host();
    const avatar = mountAvatar(el, { definition: examples[0], material: glassMaterial, still: true });
    try {
      await frame();
      expect(renderGlass).toHaveBeenCalledTimes(1);
      expect(renderFluffy).not.toHaveBeenCalled();
      await frame();
      expect(renderGlass).toHaveBeenCalledTimes(1);
      avatar.update({ material: fluffyMaterial });
      await frame();
      expect(renderFluffy).toHaveBeenCalledTimes(1);
      renderGlass.mockReturnValue(null);
      avatar.update({ material: glassMaterial });
      await frame();
      expect(painted(el).some((call) => call.op === 'fill')).toBe(true);
      avatar.update({ renderer: 'scene' });
      await frame();
      expect(el.querySelector('svg')).not.toBeNull();
      expect(el.querySelector('canvas')).toBeNull();
    } finally {
      avatar.destroy();
      renderGlass.mockRestore();
      renderFluffy.mockRestore();
    }
  });

  it('accepts a caller-supplied material and falls back for marks it does not paint', () => {
    const tile = document.createElement('canvas');
    const render = vi.fn().mockReturnValue({ canvas: tile, x: 0, y: 0, size: 64, cx: 50, cy: 50, radius: 24 });
    const material: CanvasMaterial = { id: 'custom', render };
    const el = host();
    const surface = mountCanvas(el, 'custom', examples[0], 6);
    paintCanvas(surface, liveFrame(examples[0], { size: 96 }), 96, '#123456', '#151515', material);
    expect(render).toHaveBeenCalledTimes(1);
    expect(render.mock.lastCall?.[2]).toMatchObject({ color: '#123456', ink: '#151515' });
    expect(painted(el).some((call) => call.op === 'drawImage')).toBe(true);
    paintCanvas(surface, liveFrame(examples[0], { state: 'thinking', size: 96 }), 96, '#123456', '#151515', material);
    expect(painted(el).filter((call) => call.op === 'fill')).toHaveLength(3);
    el.remove();
  });

  it('draws flat and warns once for a material given by name', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const el = host();
    // What a host wrote before materials were values, and what an untyped caller may still pass.
    const avatar = mountAvatar(el, { definition: examples[0], material: 'fluffy' as never, still: true });
    try {
      await frame();
      expect(el.querySelector('svg')).not.toBeNull();
      expect(el.querySelector('canvas')).toBeNull();
      avatar.update({ still: false });
      await frame();
      await frame();
      expect(painted(el).some((call) => call.op === 'fill')).toBe(true);
      expect(painted(el).some((call) => call.op === 'drawImage')).toBe(false);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain('Import { fluffy } from "open-bot-avatar/materials/fluffy"');
      avatar.update({ material: 'flat' });
      avatar.update({ material: undefined });
      await frame();
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      avatar.destroy();
      warn.mockRestore();
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
      for (const time of [0, .2]) paintCanvas(surface, markFrame('thinking', time), 96, '#589df2', '#151515', fluffyMaterial);
      expect(render).toHaveBeenCalledTimes(1);
      expect(painted(el).filter(call => call.op === 'drawImage')).toHaveLength(6);

      render.mockReturnValue(null);
      paintCanvas(surface, markFrame('blocked', 0), 96, '#7757f2', '#151515', fluffyMaterial);
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
