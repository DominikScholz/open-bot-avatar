import { describe, expect, it } from 'vitest';
import { createAnimator } from '../src/animator.ts';
import { ACTIVITIES, blendPoses, computePose } from '../src/motion.ts';
import { MOOD_MS, moodProgress, settleMood, type MoodState } from '../src/mood.ts';

const base = { seed: 7, time: 3.2, reducedMotion: false };

describe('mood changes', () => {
  it('blend from one pose to the other, exactly at both ends', () => {
    const a = computePose({ ...base, motion: 'idle' });
    const b = computePose({ ...base, motion: 'happy' });
    expect(blendPoses(a, b, 0)).toEqual(a);
    expect(blendPoses(a, b, 1)).toEqual(b);
    const mid = blendPoses(a, b, 0.5);
    expect(mid.roll).toBeCloseTo((a.roll + b.roll) / 2, 9);
  });

  it('morph eye shapes from one mood to the other', () => {
    const a = computePose({ ...base, motion: 'idle' });
    const b = computePose({ ...base, motion: 'happy' });
    const mid = blendPoses(a, b, 0.5);
    expect(mid.eyes[0].w).toBeCloseTo((a.eyes[0].w + b.eyes[0].w) / 2, 9);
    expect(mid.eyes[1].arch).toBeCloseTo((a.eyes[1].arch + b.eyes[1].arch) / 2, 9);
  });

  it('ease in through computePose', () => {
    const from = computePose({ ...base, motion: 'idle' });
    const to = computePose({ ...base, motion: 'happy' });
    expect(computePose({ ...base, motion: 'happy', blend: { from: 'idle', t: 0 } })).toEqual(from);
    expect(computePose({ ...base, motion: 'happy', blend: { from: 'idle', t: 1 } })).toEqual(to);
  });

  it('ease between a mood and activity pair and another', () => {
    const from = computePose({ ...base, motion: 'sad', activity: 'working' });
    const to = computePose({ ...base, motion: 'happy', activity: 'waiting' });
    const blend = { from: { motion: 'sad', activity: 'working' }, t: 0 } as const;
    expect(computePose({ ...base, motion: 'happy', activity: 'waiting', blend })).toEqual(from);
    expect(computePose({ ...base, motion: 'happy', activity: 'waiting', blend: { ...blend, t: 1 } })).toEqual(to);
    expect(from).not.toEqual(computePose({ ...base, motion: 'sad' }));
  });

  it('progress eases from 0 to 1 over MOOD_MS', () => {
    expect(moodProgress(0)).toBe(0);
    expect(moodProgress(MOOD_MS)).toBe(1);
    expect(moodProgress(MOOD_MS / 2)).toBeCloseTo(0.5, 9);
  });

  it('never grows the chain of interrupted changes', () => {
    let state: MoodState = { motion: 'idle' };
    const moods = ['sad', 'happy', 'idle'] as const;
    for (let i = 0; i < 50; i++) state = { motion: moods[i % 3], blend: { from: settleMood(state), t: 0.3 } };
    let depth = 0;
    for (let s: MoodState | string = state; typeof s !== 'string' && s.blend; s = s.blend.from) depth++;
    expect(depth).toBeLessThanOrEqual(5);
  });
});

describe('activities', () => {
  const lifts = (motion: 'happy' | 'celebrate', activity?: 'working') =>
    Array.from({ length: 80 }, (_, i) => computePose({ ...base, time: i * 0.07, motion, activity }));

  it('treat motion thinking as idle plus the thinking activity, and let an explicit activity win', () => {
    for (const reducedMotion of [false, true]) {
      const idle = computePose({ ...base, reducedMotion, motion: 'idle', activity: 'thinking' });
      expect(computePose({ ...base, reducedMotion, motion: 'thinking' })).toEqual(idle);
      expect(computePose({ ...base, reducedMotion, motion: 'thinking', activity: 'working' })).toEqual(computePose({ ...base, reducedMotion, motion: 'idle', activity: 'working' }));
    }
  });

  it('leave a mood without an activity as it was, and damp its body motion under one', () => {
    expect(Math.min(...lifts('happy').map((p) => p.lift))).toBeLessThan(-3);
    expect(Math.min(...lifts('happy', 'working').map((p) => p.lift))).toBeGreaterThan(-1.5);
    expect(Math.max(...lifts('celebrate').map((p) => p.yaw))).toBeGreaterThan(5);
    expect(Math.max(...lifts('celebrate', 'working').map((p) => p.yaw))).toBeLessThan(1);
  });

  it('keep the mood eyes recognisable', () => {
    const happy = computePose({ ...base, motion: 'happy' }).eyes[0];
    for (const activity of ACTIVITIES) expect(computePose({ ...base, motion: 'happy', activity }).eyes[0].arch).toBe(happy.arch);
  });

  it('differ from each other and from none under reduced motion', () => {
    const poses = [undefined, ...ACTIVITIES].map((activity) => JSON.stringify(computePose({ ...base, motion: 'idle', activity, reducedMotion: true })));
    expect(new Set(poses).size).toBe(poses.length);
  });
});

describe('animator', () => {
  it('eases a mood change in and then settles', () => {
    const a = createAnimator();
    expect(a.step({ now: 0, motion: 'idle', target: null, reducedMotion: false }).moving).toBe(false);
    const start = a.step({ now: 16, motion: 'happy', target: null, reducedMotion: false });
    expect(start.motionBlend).toEqual({ from: { motion: 'idle' }, t: 0 });
    const half = a.step({ now: 16 + MOOD_MS / 2, motion: 'happy', target: null, reducedMotion: false });
    expect(half.motionBlend?.t).toBeCloseTo(0.5, 6);
    const done = a.step({ now: 16 + MOOD_MS + 1, motion: 'happy', target: null, reducedMotion: false });
    expect(done.motionBlend).toBeUndefined();
    expect(done.moving).toBe(false);
  });

  it('starts a blend when only the activity changes', () => {
    const a = createAnimator();
    a.step({ now: 0, motion: 'happy', activity: 'working', target: null, reducedMotion: false });
    const start = a.step({ now: 16, motion: 'happy', activity: 'waiting', target: null, reducedMotion: false });
    expect(start.motionBlend).toEqual({ from: { motion: 'happy', activity: 'working' }, t: 0 });
    expect(start.moving).toBe(true);
    const snap = createAnimator();
    snap.step({ now: 0, motion: 'happy', activity: 'working', target: null, reducedMotion: true });
    expect(snap.step({ now: 16, motion: 'happy', activity: 'waiting', target: null, reducedMotion: true }).motionBlend).toBeUndefined();
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
    const step = a.step({ now: 16, motion: 'sad', target: { x: 0.3, y: 0 }, reducedMotion: true });
    expect(step.motionBlend).toBeUndefined();
    expect(step.gaze).toEqual({ x: 0.3, y: 0, weight: 1 });
  });
});
