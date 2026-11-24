import { describe, expect, it } from 'vitest';
import {
  avatarFrame, computePose, createAnimator, getExample, renderAvatarSvg, resolveLook, sceneFrame, stateDefinition, BASE_YAW, DONE_TURN_S, STATES,
  type AvatarFrame, type AvatarMark, type AvatarStateDefinition, type FrameShape,
} from '../src/index.ts';

const mug = getExample('mug')!;
const base = { seed: 7, time: 1.3, reducedMotion: false };
const isMark = (s: FrameShape) => s.kind === 'slice' && s.key.startsWith('mark-');
const marksOf = (frame: AvatarFrame) => frame.shapes.filter(isMark);
const bodyOf = (frame: AvatarFrame) => frame.shapes.filter((s) => s.kind === 'slice' && !isMark(s));

/** A host's own mark and a state that shows it, as a host would write them. */
const square: AvatarMark = {
  id: 'square',
  parts: ({ unit }) => [{ shape: 'square', d: 'M-9 -9H9V9H-9Z', box: { x: -9, y: -9, w: 18, h: 18 }, x: 0, y: -unit / 10, turn: 0, scale: 1 }],
};
const asking: AvatarStateDefinition = { id: 'asking', pose: () => ({ sx: 0.99, sy: 1.02, marks: [{ mark: square, weight: 1 }] }) };
/** A state that keeps the body: at rest, leaning, eyes narrowed. */
const leaning: AvatarStateDefinition = { id: 'leaning', pose: (ctx) => ({ ...ctx.rest(2), roll: 12, squintL: 0.5 }) };

describe('a state of the host\'s own', () => {
  it('is drawn wherever a state is taken: its mark in place of the body, in every renderer', () => {
    const frame = avatarFrame(mug, { state: asking, time: 1 });
    expect(marksOf(frame).length).toBe(1);
    expect(bodyOf(frame).length).toBe(0);
    const [mark] = marksOf(frame);
    expect(frame.paths.find((p) => mark.kind === 'slice' && p.id === mark.path)?.d).toBe('M-9 -9H9V9H-9Z');
    expect(renderAvatarSvg(mug, { state: asking, time: 1 })).toContain('M-9 -9H9V9H-9Z');
    expect(sceneFrame(mug, { state: asking, time: 1 }).front).toContain('M-9 -9H9V9H-9Z');
    expect(sceneFrame(mug, { state: asking, time: 1 }).body).toBe(0);
    // None of it is there for a built-in state.
    expect(renderAvatarSvg(mug, { state: 'blocked', time: 1 })).not.toContain('M-9 -9H9V9H-9Z');
  });

  it('lays what its pose returns over the base pose, with the look target and view on top', () => {
    const pose = computePose({ ...base, state: asking });
    const idle = computePose({ ...base, state: 'idle' });
    expect(pose).toMatchObject({ sx: 0.99, sy: 1.02, yaw: BASE_YAW, roll: 0, lift: 0, blink: 0, ribbons: 0 });
    expect(pose.marks).toEqual([{ mark: square, weight: 1 }]);
    expect(pose.eyes).toEqual({ arc: 0, slit: 0 });
    expect(computePose({ ...base, state: asking, mood: 'happy' }).eyes.arc).toBe(1);
    expect(computePose({ ...base, state: asking, view: { yaw: 0.4, pitch: 0 } }).yaw).toBeCloseTo(BASE_YAW + 0.4);
    expect(computePose({ ...base, state: leaning, gaze: { x: 1, y: 0 } }).gazeX).toBeGreaterThan(0.5);
    // ctx.rest is the calm pose idle uses, at the pace asked for.
    const lean = computePose({ ...base, state: leaning });
    expect(lean).toMatchObject({ roll: 12, squintL: 0.5 });
    expect(lean.sy).not.toBe(1);
    expect(computePose({ ...base, state: { id: 'calm', pose: (ctx) => ctx.rest() } })).toEqual(idle);
    expect(computePose({ ...base, state: leaning, reducedMotion: true })).toMatchObject({ lift: 0, sy: 1, blink: 0 });
  });

  it('gets the context a built-in state gets', () => {
    let seen: Parameters<AvatarStateDefinition['pose']>[0] | undefined;
    const spy: AvatarStateDefinition = { id: 'spy', pose: (ctx) => ((seen = ctx), {}) };
    computePose({ seed: 7, time: 2, state: spy, mood: 'happy', stateAge: 4.5, reducedMotion: false, gaze: { x: 0, y: 0, weight: 1 } });
    expect(seen).toMatchObject({ seed: 7, time: 2, stateAge: 4.5, mood: 'happy', reducedMotion: false, live: 1 });
    expect(seen!.t).not.toBe(2);
    expect(seen!.sway).toBeCloseTo(0.3);
    expect(seen!.base.eyes.arc).toBe(1);
    computePose({ seed: 7, time: 2, state: spy, reducedMotion: true });
    expect(seen).toMatchObject({ t: 0, live: 0, stateAge: undefined });
    expect(seen!.wave(3)).toBe(0);
  });

  it('eases to and from the built-in states, mark for mark', () => {
    const mid = computePose({ ...base, state: asking, blend: { from: { state: 'thinking' }, t: 0.5 } });
    expect(mid.marks.map((m) => [m.mark.id, m.weight])).toEqual([['dots', 0.5], ['square', 0.5]]);
    const back = computePose({ ...base, state: 'idle', blend: { from: { state: asking }, t: 0.25 } });
    expect(back.marks).toEqual([{ mark: square, weight: 0.75 }]);
    expect(back.sy).toBeGreaterThan(computePose({ ...base, state: 'idle' }).sy);
    // The mark is still on screen while the body returns, then gone.
    expect(marksOf(avatarFrame(mug, { state: 'idle', time: 1, motionBlend: { from: { state: asking }, t: 0.1 } })).length).toBe(1);
    expect(marksOf(avatarFrame(mug, { state: 'idle', time: 1, motionBlend: { from: { state: asking }, t: 0.9 } })).length).toBe(0);
  });

  it('is one state by its id: the animator eases into it, counts its age and takes its start age', () => {
    const step = (a: ReturnType<typeof createAnimator>, now: number, state: AvatarStateDefinition | 'idle' | 'blocked') => a.step({ now, state, target: null, reducedMotion: false });
    const a = createAnimator();
    step(a, 0, 'idle');
    const change = step(a, 1000, asking);
    expect(change.stateAge).toBe(0);
    expect(change.motionBlend).toEqual({ from: { state: 'idle', mood: 'neutral', age: 1, blend: undefined }, t: 0 });
    expect(step(a, 1500, asking).stateAge).toBeCloseTo(0.5, 9);
    // The same state built again (as a component that renders again would) is no change.
    const again = step(a, 2000, { ...asking });
    expect(again.stateAge).toBeCloseTo(1, 9);
    expect(again.motionBlend).toBeUndefined();
    // Leaving it eases from it, with the age it had.
    expect(step(a, 2500, 'blocked').motionBlend).toEqual({ from: { state: expect.objectContaining({ id: 'asking' }), mood: 'neutral', age: 1.5, blend: undefined }, t: 0 });
    // A state that mounts part way in, like done.
    expect(step(createAnimator(), 0, { ...asking, startAge: 2 }).stateAge).toBe(2);
    expect(step(createAnimator(), 0, asking).stateAge).toBe(0);
  });

  it('keeps its age through a blend from the same id, and holds the age of a state it left', () => {
    const ages: (number | undefined)[] = [];
    const aged = (id: string): AvatarStateDefinition => ({ id, pose: (ctx) => (ages.push(ctx.stateAge), {}) });
    computePose({ ...base, state: aged('a'), stateAge: 5, blend: { from: { state: aged('a'), mood: 'happy', age: 3 }, t: 0.5 } });
    expect(ages).toEqual([5, 5]);
    ages.length = 0;
    computePose({ ...base, state: aged('a'), stateAge: 5, blend: { from: { state: aged('b'), age: 3 }, t: 0.5 } });
    expect(ages).toEqual([5, 3]);
  });
});

describe('the six states', () => {
  it('are definitions a host can build on', () => {
    for (const state of STATES) {
      const def = stateDefinition(state);
      expect(def.id).toBe(state);
      expect(computePose({ ...base, state: def, stateAge: 1 })).toEqual(computePose({ ...base, state, stateAge: 1 }));
    }
    expect(stateDefinition('done').startAge).toBe(DONE_TURN_S);
    expect(stateDefinition(asking)).toBe(asking);
    // Blocked with another mark: everything else as blocked has it.
    const blocked = stateDefinition('blocked');
    const variant: AvatarStateDefinition = { id: 'asking', pose: (ctx) => ({ ...blocked.pose(ctx), marks: [{ mark: square, weight: 1 }] }) };
    const { marks, ...rest } = computePose({ ...base, state: variant });
    expect(rest).toEqual((({ marks: _, ...r }) => r)(computePose({ ...base, state: 'blocked' })));
    expect(marks[0].mark).toBe(square);
  });

  it('are what anything that is not a state falls back to', () => {
    for (const junk of [{ id: 'x' }, { pose: () => ({}) }, { id: 3, pose: () => ({}) }, null, 42, 'asking']) {
      expect(computePose({ ...base, state: junk as never })).toEqual(computePose({ ...base, state: 'idle' }));
    }
    // resolveLook reads names only: values from a link or a stored look.
    expect(resolveLook({ state: asking }).state).toBe('idle');
  });
});
