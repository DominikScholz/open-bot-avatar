import { describe, expect, it } from 'vitest';
import { outlineModel } from '../src/dom/fluffy/marks.ts';
import { bodyScale, markParts } from '../src/effects.ts';
import { avatarFrame, computePose, createAnimator, getExample, renderAvatarSvg, sceneFrame, type AvatarMark, type AvatarStateDefinition } from '../src/index.ts';
import { BANG, DOTS } from '../src/marks.ts';

const mug = getExample('mug')!;
const part = (shape: string, d = 'M-9 -9H9V9H-9Z') => ({ shape, d, box: { x: -9, y: -9, w: 18, h: 18 }, x: 0, y: 0, turn: 0, scale: 1 });
const showing = (...parts: ReturnType<typeof part>[]): AvatarStateDefinition => ({ id: 'custom', pose: () => ({ marks: [{ mark: { id: 'custom', parts: () => parts }, weight: 1 }] }) });

describe('marks and states at the edges', () => {
  it('a mark\'s path never shares an id with a body slice', () => {
    const body = new Set(avatarFrame(mug, { state: 'idle' }).paths.map((p) => p.id));
    for (const shape of ['0', '1', '12']) {
      const frame = avatarFrame(mug, { state: showing(part(shape)) });
      expect(frame.paths.length).toBe(1);
      expect(body.has(frame.paths[0].id)).toBe(false);
    }
    // Half way to a mark both are in one frame, each under its own id.
    const mid = avatarFrame(mug, { state: showing(part('0')), motionBlend: { from: { state: 'idle' }, t: 0.5 } });
    expect(new Set(mid.paths.map((p) => p.id)).size).toBe(mid.paths.length);
  });

  it('a mark\'s shape and outline cannot become markup', () => {
    const evil = '"><script>alert(1)</script><path d="';
    const state = showing(part(evil, `M0 0L5 5Z"/><script>alert(2)</script><path d="`));
    for (const out of [renderAvatarSvg(mug, { state }), sceneFrame(mug, { state }).front]) {
      expect(out).not.toContain('<script');
      expect(out).toContain('L5 5Z&#34;/&#62;&#60;script&#62;');
    }
    for (const p of avatarFrame(mug, { state }).paths) expect(p.id).toMatch(/^[A-Za-z][\w-]*$/);
    // Distinct shapes keep distinct ids, and the built-in ones the ids they had.
    const two = avatarFrame(mug, { state: showing(part('a b'), part('a/b', 'M-5 -5H5V5H-5Z')) });
    expect(new Set(two.paths.map((p) => p.id)).size).toBe(2);
    const id = avatarFrame(mug, { state: 'idle' }).paths[0].id.replace(/-\d+$/, '');
    expect(avatarFrame(mug, { state: 'blocked' }).paths.map((p) => p.id)).toEqual([`${id}-bar`, `${id}-dot`]);
    expect(avatarFrame(mug, { state: 'thinking' }).paths.map((p) => p.id)).toEqual([`${id}-dot3`]);
  });

  it('something is drawn whatever the marks weigh', () => {
    const third: AvatarMark = { id: 'third', parts: () => [part('third')] };
    const bounds = { minX: 10, minY: 10, maxX: 90, maxY: 90 };
    for (const marks of [
      [BANG, DOTS, third].map((mark) => ({ mark, weight: 1 / 3 })),
      [BANG, DOTS].map((mark) => ({ mark, weight: 0.3 })),
      [BANG, DOTS, third].map((mark) => ({ mark, weight: 0.45 })),
    ]) {
      expect(markParts(bounds, marks, 1, 0, true)).toEqual([]);
      expect(bodyScale(marks)).toBeGreaterThan(0.05);
    }
    // A mark that shows takes the body's place as before.
    expect(bodyScale([{ mark: BANG, weight: 1 }])).toBe(0);
    expect(bodyScale([{ mark: BANG, weight: 0.5 }, { mark: DOTS, weight: 0.5 }])).toBe(0);
    expect(bodyScale([{ mark: BANG, weight: 0.3 }])).toBeCloseTo(1 - ((0.3 / 0.55) ** 2) * (3 - 2 * (0.3 / 0.55)));
    // Through the frame: a change between two marks interrupted by a third.
    const state: AvatarStateDefinition = { id: 'third', pose: () => ({ marks: [{ mark: third, weight: 1 }] }) };
    for (let t = 0; t <= 1; t += 0.02) for (let u = 0; u <= 1; u += 0.1) {
      const frame = avatarFrame(mug, { state, time: 1, motionBlend: { from: { state: 'blocked', blend: { from: { state: 'thinking' }, t: u } }, t } });
      expect(frame.shapes.length).toBeGreaterThan(0);
    }
  });

  it('a definition updated under one id is the one a later change eases from', () => {
    const lean = (roll: number): AvatarStateDefinition => ({ id: 'lean', pose: () => ({ roll }) });
    const a = createAnimator();
    const step = (now: number, state: AvatarStateDefinition | 'idle') => a.step({ now, state, target: null, reducedMotion: false });
    step(0, lean(2));
    const updated = step(100, lean(12));
    expect(updated.motionBlend).toBeUndefined();
    expect(updated.stateAge).toBeCloseTo(0.1);
    const leaving = step(200, 'idle');
    expect(leaving.stateAge).toBe(0);
    const from = leaving.motionBlend!.from as { state: AvatarStateDefinition; age: number };
    expect(from.age).toBeCloseTo(0.2);
    expect(computePose({ seed: 1, time: 0, state: 'idle', reducedMotion: true, blend: leaving.motionBlend }).roll).toBe(12);
    // Updated during a blend into it, the blend carries on.
    const b = createAnimator();
    b.step({ now: 0, state: 'idle', target: null, reducedMotion: false });
    b.step({ now: 100, state: lean(2), target: null, reducedMotion: false });
    const during = b.step({ now: 200, state: lean(12), target: null, reducedMotion: false });
    expect(during.motionBlend?.t).toBeGreaterThan(0);
    expect(during.stateAge).toBeCloseTo(0.1);
  });

  it('an outline of two squares wound opposite ways still gets a model', () => {
    const box = { x: -20, y: -5, w: 40, h: 10 };
    const same = outlineModel('M-20 -5H-10V5H-20ZM10 -5H20V5H10Z', box);
    const opposite = outlineModel('M-20 -5H-10V5H-20ZM10 -5V5H20V-5Z', box);
    expect(same).not.toBeNull();
    expect(opposite).not.toBeNull();
    expect(opposite!.scale).toBeCloseTo(same!.scale, 1);
    expect(opposite!.volume.parts.length).toBe(2);
  });

  it('a curve whose control point lies far outside its box still gets a model', () => {
    // A lens: two quadratic curves between the same points, controls well outside the outline.
    const d = 'M-30 0Q0 -40 30 0Q0 40 -30 0Z';
    const model = outlineModel(d, { x: -30, y: -20, w: 60, h: 40 });
    expect(model).not.toBeNull();
    expect(model!.volume.parts.length).toBe(1);
    // Scaled up, the controls sit at about -6 and 106 in the model: fine. Larger still, past the body parser's bounds.
    const far = outlineModel('M-30 0Q0 -200 30 0Q0 200 -30 0Z', { x: -30, y: -100, w: 60, h: 200 });
    expect(far).not.toBeNull();
    expect(far!.volume.parts.length).toBe(1);
  });
});
