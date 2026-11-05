/**
 * The engine changes made for the letter avatars: the angry mood, occasional happy jumps
 * and the eye size option.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { avatarFrame } from '../src/index.ts';
import { hopAt } from '../src/motion.ts';
import type { AvatarDefinition } from '../src/types.ts';

const letter = (name: string): AvatarDefinition => JSON.parse(readFileSync(`gallery/letter-${name}.json`, 'utf8'));
const eyes = (frame: ReturnType<typeof avatarFrame>) => frame.shapes.flatMap((s) => (s.kind === 'eye' ? [s.mark] : []));
const numbers = (d: string) => (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);

describe('angry mood', () => {
  const at = (time: number) => avatarFrame(letter('m'), { motion: 'angry', time, depth: 0 });
  const slant = (time: number) => {
    const mark = eyes(at(time))[0];
    if (mark.shape !== 'arc') throw new Error('expected a bar');
    const [x0, y0, x1, y1] = numbers(mark.d);
    return (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI;
  };

  it('slants both eyes down toward the middle', () => {
    const [left, right] = eyes(at(1));
    if (left.shape !== 'arc' || right.shape !== 'arc') throw new Error('expected bars');
    const [, ly0, , ly1] = numbers(left.d);
    const [, ry0, , ry1] = numbers(right.d);
    expect(ly1).toBeGreaterThan(ly0);
    expect(ry1).toBeLessThan(ry0);
  });

  it('changes the eye angle over time', () => {
    const angles = Array.from({ length: 80 }, (_, i) => slant(i * 0.1));
    expect(Math.max(...angles) - Math.min(...angles)).toBeGreaterThan(10);
  });

  it('does not shake', () => {
    const roll = (time: number) => (Math.atan2(at(time).root[1], at(time).root[0]) * 180) / Math.PI;
    for (let t = 0; t < 8; t += 0.05) expect(Math.abs(roll(t + 0.05) - roll(t))).toBeLessThan(0.2);
  });
});

describe('happy jumps', () => {
  const FRAME = 1 / 60;

  it('jumps only some of the time', () => {
    let hopping = 0, total = 0;
    for (let t = 0; t < 300; t += FRAME, total++) if (hopAt(11, t).air > 0) hopping++;
    expect(hopping / total).toBeGreaterThan(0.05);
    expect(hopping / total).toBeLessThan(0.3);
  });

  it('eases into and out of a jump without snapping', () => {
    let previous = hopAt(11, 0);
    for (let t = FRAME; t < 300; t += FRAME) {
      const now = hopAt(11, t);
      expect(Math.abs(now.land - previous.land)).toBeLessThan(0.25);
      previous = now;
    }
  });

  it('gives different letters different timing', () => {
    const when = (seed: number) => {
      for (let t = 0; t < 60; t += FRAME) if (hopAt(seed, t).air > 0) return t;
      return -1;
    };
    expect(when(11)).not.toBe(when(2024));
  });
});

describe('eye size', () => {
  const size = (eyeBoost?: number) => {
    const mark = eyes(avatarFrame(letter('a'), { motion: 'idle', time: 1, depth: 0, reducedMotion: true, eyeBoost }))[0];
    if (mark.shape !== 'pill') throw new Error('expected a pill');
    return mark.width;
  };

  it('scales the eyes by eyeBoost', () => {
    expect(size(1.25)).toBeCloseTo(size() * 1.25, 1);
  });
});

describe('wide eyes stay apart', () => {
  it.each(['happy', 'angry'] as const)('%s eyes keep a gap, even when enlarged', (motion) => {
    const [a, b] = eyes(avatarFrame(letter('i'), { motion, time: 0, depth: 0, reducedMotion: true, eyeBoost: 1.12, gaze: { x: 0, y: 0 } }));
    if (a.shape !== 'arc' || b.shape !== 'arc') throw new Error('expected arcs or bars');
    const xs = (d: string) => numbers(d).filter((_, i) => i % 2 === 0);
    expect(Math.min(...xs(b.d)) - Math.max(...xs(a.d))).toBeGreaterThan(a.strokeWidth);
  });
});
