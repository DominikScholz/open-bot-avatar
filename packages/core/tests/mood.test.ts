import { describe, expect, it } from 'vitest';
import { createAnimator } from '../src/animator.ts';
import { blendPoses, computePose } from '../src/motion.ts';
import { MOOD_MS, moodProgress, settleMood, type MoodState } from '../src/mood.ts';

const base = { seed: 7, time: 3.2, reducedMotion: false };

describe('mood changes', () => {
  it('blend from one pose to the other, exactly at both ends', () => {
    const a = computePose({ ...base, motion: 'idle' });
    const b = computePose({ ...base, motion: 'thinking' });
    expect(blendPoses(a, b, 0)).toEqual(a);
    expect(blendPoses(a, b, 1)).toEqual(b);
    const mid = blendPoses(a, b, 0.5);
    expect(mid.roll).toBeCloseTo((a.roll + b.roll) / 2, 9);
  });

  it('morph the eyes from one shape to the other, with no blink to hide a swap', () => {
    const a = computePose({ ...base, motion: 'idle' });
    const b = computePose({ ...base, motion: 'happy' });
    expect(a.eyes.arc).toBe(0);
    expect(b.eyes.arc).toBe(1);
    expect(blendPoses(a, b, 0.25).eyes.arc).toBeCloseTo(0.25, 9);
    expect(blendPoses(a, b, 0.5).blink).toBeCloseTo((a.blink + b.blink) / 2, 9);
  });

  it('ease in through computePose', () => {
    const from = computePose({ ...base, motion: 'idle' });
    const to = computePose({ ...base, motion: 'happy' });
    expect(computePose({ ...base, motion: 'happy', blend: { from: 'idle', t: 0 } })).toEqual(from);
    expect(computePose({ ...base, motion: 'happy', blend: { from: 'idle', t: 1 } })).toEqual(to);
  });

  it('progress eases from 0 to 1 over MOOD_MS', () => {
    expect(moodProgress(0)).toBe(0);
    expect(moodProgress(MOOD_MS)).toBe(1);
    expect(moodProgress(MOOD_MS / 2)).toBeCloseTo(0.5, 9);
  });

  it('never grows the chain of interrupted changes', () => {
    let state: MoodState = { state: 'idle' };
    const states = ['thinking', 'working', 'idle'] as const;
    for (let i = 0; i < 50; i++) state = { state: states[i % 3], mood: 'happy', age: i, blend: { from: settleMood(state), t: 0.3 } };
    let depth = 0;
    for (let s: MoodState | string = state; typeof s !== 'string' && s.blend; s = s.blend.from) depth++;
    expect(depth).toBeLessThanOrEqual(5);
  });
});

describe('animator', () => {
  it('eases a mood change in and then settles', () => {
    const a = createAnimator();
    expect(a.step({ now: 0, motion: 'idle', target: null, reducedMotion: false }).moving).toBe(false);
    const start = a.step({ now: 16, motion: 'happy', target: null, reducedMotion: false });
    expect(start.motionBlend).toEqual({ from: { state: 'idle', mood: 'neutral', age: Infinity, blend: undefined }, t: 0 });
    const half = a.step({ now: 16 + MOOD_MS / 2, motion: 'happy', target: null, reducedMotion: false });
    expect(half.motionBlend?.t).toBeCloseTo(0.5, 6);
    const done = a.step({ now: 16 + MOOD_MS + 1, motion: 'happy', target: null, reducedMotion: false });
    expect(done.motionBlend).toBeUndefined();
    expect(done.moving).toBe(false);
  });

  it('turns toward a target and lets go of it gradually', () => {
    const a = createAnimator();
    let step = a.step({ now: 0, motion: 'idle', target: { x: 1, y: 0 }, reducedMotion: false });
    for (let t = 16; t < 2000; t += 16) step = a.step({ now: t, motion: 'idle', target: { x: 1, y: 0 }, reducedMotion: false });
    expect(step.gaze?.x).toBeCloseTo(1, 2);
    expect(step.gaze?.weight).toBeCloseTo(1, 2);
    const leaving = a.step({ now: 2016, motion: 'idle', target: null, reducedMotion: false });
    expect(leaving.gaze?.weight).toBeGreaterThan(0.9);
    expect(leaving.moving).toBe(true);
  });

  it('holds the look while asked to', () => {
    const a = createAnimator();
    for (let t = 0; t < 500; t += 16) a.step({ now: t, motion: 'idle', target: { x: 0.5, y: 0.5 }, reducedMotion: false });
    const held = a.step({ now: 516, motion: 'idle', target: { x: -1, y: -1 }, hold: true, reducedMotion: false });
    const later = a.step({ now: 900, motion: 'idle', target: { x: -1, y: -1 }, hold: true, reducedMotion: false });
    expect(later.gaze).toEqual(held.gaze);
  });

  it('snaps under reduced motion', () => {
    const a = createAnimator();
    a.step({ now: 0, motion: 'idle', target: null, reducedMotion: true });
    const step = a.step({ now: 16, motion: 'thinking', target: { x: 0.3, y: 0 }, reducedMotion: true });
    expect(step.motionBlend).toBeUndefined();
    expect(step.gaze).toEqual({ x: 0.3, y: 0, weight: 1 });
  });
});
