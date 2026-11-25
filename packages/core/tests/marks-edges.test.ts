import { describe, expect, it } from 'vitest';
import { outlineModel } from '../src/dom/materials/marks.ts';
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

  it('a pose that returns less than a pose, or nonsense, keeps the base pose for those fields', () => {
    const base = computePose({ seed: 1, time: 0, state: { id: 'plain', pose: () => ({}) }, reducedMotion: true });
    const odd = (partial: object) => computePose({ seed: 1, time: 0, state: { id: 'odd', pose: () => partial as never }, reducedMotion: true });
    expect(odd({ marks: undefined, roll: undefined, sx: Number.NaN, lift: 'up', eyes: undefined })).toEqual(base);
    expect(odd({ eyes: { arc: 1 } }).eyes).toEqual({ arc: 1, slit: 0 });
    expect(odd({ marks: 'none' }).marks).toEqual([]);
    const third: AvatarMark = { id: 'third', parts: () => [part('third')] };
    // Marks without a weight that counts are left out, weights are held to 0..1, one mark per id, in id order.
    expect(odd({ marks: [{ mark: third, weight: Number.NaN }, { mark: third }, null, { weight: 1 }, { mark: DOTS, weight: 7 }, { mark: BANG, weight: 0.5 }, { mark: BANG, weight: 0.2 }] }).marks)
      .toEqual([{ mark: BANG, weight: 0.5 }, { mark: DOTS, weight: 1 }]);
    for (const partial of [{ marks: undefined }, { marks: [{ mark: third, weight: Number.NaN }] }, { roll: undefined }, { eyes: { arc: 1 } }]) {
      const state = { id: 'odd', pose: () => partial as never };
      const svg = renderAvatarSvg(mug, { state, motionBlend: { from: { state: 'idle' }, t: 0.5 } });
      expect(svg).not.toMatch(/NaN|undefined/);
      expect(avatarFrame(mug, { state }).shapes.length).toBeGreaterThan(0);
    }
    // A start age that is not a number is no start age.
    expect(createAnimator().step({ now: 0, state: { id: 'odd', pose: () => ({}), startAge: Number.NaN }, target: null, reducedMotion: false }).stateAge).toBe(0);
  });

  it('a mark that lays out less than its parts, or nonsense, cannot throw or put NaN into a frame', () => {
    const drawn = (parts: unknown) => {
      const state: AvatarStateDefinition = { id: 'custom', pose: () => ({ marks: [{ mark: { id: 'custom', parts: () => parts as never }, weight: 1 }] }) };
      const out = [renderAvatarSvg(mug, { state }), JSON.stringify(avatarFrame(mug, { state })), JSON.stringify(sceneFrame(mug, { state }))];
      for (const text of out) expect(text).not.toMatch(/NaN|undefined|Infinity/);
      return avatarFrame(mug, { state });
    };
    // No list of parts, or entries that are no parts: nothing of the mark is drawn.
    for (const none of [undefined, null, 'parts', {}, [null], [undefined], [7], [{}]]) expect(drawn(none).shapes).toEqual([]);
    // A part needs a name, an outline and a box with a size.
    const whole = part('whole');
    for (const broken of [{ ...whole, shape: 7 }, { ...whole, d: 5 }, { ...whole, d: '' }, { ...whole, box: undefined }, { ...whole, box: { x: 0, y: 0, w: Number.NaN, h: 4 } }, { ...whole, box: { x: 0, y: 0, w: 0, h: 4 } }]) {
      expect(drawn([broken, whole]).paths.map((p) => p.d)).toEqual([whole.d]);
    }
    // A place, turn or scale that is no number is that of a part at rest in the mark's centre.
    const [atRest] = drawn([whole]).shapes;
    for (const slip of [{ x: Number.NaN }, { y: undefined }, { turn: undefined }, { scale: undefined }, { x: '3', y: null, turn: Number.POSITIVE_INFINITY, scale: Number.NaN }]) {
      expect(drawn([{ ...whole, ...slip }]).shapes).toEqual([atRest]);
    }
    // What is given and usable is kept as it is.
    const bounds = { minX: 10, minY: 10, maxX: 90, maxY: 90 };
    const moved = { ...whole, x: 3, y: -4, turn: 0.5, scale: 2, round: true };
    expect(markParts(bounds, [{ mark: { id: 'moved', parts: () => [moved] }, weight: 1 }], 1, 0, true)).toEqual([{ ...moved, x: 53, y: 46 }]);
    // A start age before the state began is none.
    expect(createAnimator().step({ now: 0, state: { id: 'early', pose: () => ({}), startAge: -5 }, target: null, reducedMotion: false }).stateAge).toBe(0);
  });

  it('a mark redefined under its id blends as the one being changed to', () => {
    const v1: AvatarMark = { id: 'm', parts: () => [part('one')] }, v2: AvatarMark = { id: 'm', parts: () => [part('two', 'M-5 -5H5V5H-5Z')] };
    const state = (mark: AvatarMark, id: string): AvatarStateDefinition => ({ id, pose: () => ({ marks: [{ mark, weight: 1 }] }) });
    const mid = computePose({ seed: 1, time: 0, state: state(v2, 'b'), reducedMotion: true, blend: { from: { state: state(v1, 'a') }, t: 0.3 } });
    expect(mid.marks).toEqual([{ mark: v2, weight: 1 }]);
  });

  it('one outline in two boxes is two models', () => {
    const d = 'M-9 -9H9V9H-9Z';
    const a = outlineModel(d, { x: -9, y: -9, w: 18, h: 18 })!, b = outlineModel(d, { x: -9, y: -9, w: 36, h: 18 })!;
    expect(a.cx).toBe(0);
    expect(b.cx).toBe(9);
    expect(b.scale).not.toBe(a.scale);
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
