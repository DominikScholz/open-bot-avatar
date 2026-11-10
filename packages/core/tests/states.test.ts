import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createAnimator } from '../src/animator.ts';
import { ribbonPieces, ribbonReach } from '../src/effects.ts';
import { examples, getExample } from '../src/examples.ts';
import { DONE_TURN_S, MOODS, STATES, computePose, resolveLook } from '../src/motion.ts';
import { isInside } from '../src/path.ts';
import { avatarExtent, avatarFrame, preparedVolume, renderAvatarSvg, sceneFrame, type AvatarFrame, type FrameShape } from '../src/render.ts';
import { analyzeBody } from '../src/validate.ts';
import type { AvatarDefinition, RenderOptions } from '../src/types.ts';

const mug = getExample('mug')!;
/** The starters and every avatar in the repo's gallery. */
const everyone: AvatarDefinition[] = [
  ...examples,
  ...(existsSync('gallery') ? readdirSync('gallery') : [])
    .filter((f) => f.endsWith('.json') && f !== 'colors.json')
    .map((f) => JSON.parse(readFileSync(`gallery/${f}`, 'utf8')) as AvatarDefinition),
];
const eyesOf = (frame: AvatarFrame) => frame.shapes.flatMap((s) => (s.kind === 'eye' ? [s.mark] : []));
const kinds = (frame: AvatarFrame, test: (s: FrameShape) => boolean) => frame.shapes.filter(test);
const isMark = (s: FrameShape) => s.kind === 'slice' && s.key.startsWith('mark-');
const isBody = (s: FrameShape) => s.kind === 'slice' && !s.key.startsWith('mark-');
const numbers = (d: string) => (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);

describe('state and mood', () => {
  it('lists the six states and the moods, and still reads the single option that came before them', () => {
    expect(STATES).toEqual(['idle', 'thinking', 'working', 'waiting', 'blocked', 'done']);
    expect(MOODS).toContain('happy');
    expect(resolveLook({})).toEqual({ state: 'idle', mood: 'neutral' });
    expect(resolveLook({ motion: 'thinking' })).toEqual({ state: 'thinking', mood: 'neutral' });
    expect(resolveLook({ motion: 'happy' })).toEqual({ state: 'idle', mood: 'happy' });
    expect(resolveLook({ motion: 'happy', state: 'working', mood: 'sad' })).toEqual({ state: 'working', mood: 'sad' });
    expect(resolveLook({ state: 'nope', mood: 7 })).toEqual({ state: 'idle', mood: 'neutral' });
  });

  it('draws the old motions exactly as the state and mood they mean', () => {
    for (const d of examples) {
      for (const time of [0, 0.7, 2.3]) {
        expect(renderAvatarSvg(d, { motion: 'happy', time })).toBe(renderAvatarSvg(d, { state: 'idle', mood: 'happy', time }));
        expect(renderAvatarSvg(d, { motion: 'idle', time })).toBe(renderAvatarSvg(d, { time }));
        expect(renderAvatarSvg(d, { motion: 'thinking', time })).toBe(renderAvatarSvg(d, { state: 'thinking', time }));
      }
    }
  });

  it('keeps a mood on any state: a happy bot has its arcs while it works, waits and finishes', () => {
    for (const state of ['idle', 'working', 'waiting', 'done'] as const) {
      const marks = eyesOf(avatarFrame(mug, { state, mood: 'happy', time: 1.1 }));
      expect(marks.length).toBe(2);
      expect(marks.every((m) => m.shape === 'arc')).toBe(true);
    }
  });
});

describe('eyes', () => {
  it('are the plain pill and the plain arc at rest, and an outline in between', () => {
    const at = (t: number) => eyesOf(avatarFrame(mug, { mood: 'happy', time: 1.1, motionBlend: { from: { state: 'idle', mood: 'neutral' }, t } }));
    expect(eyesOf(avatarFrame(mug, { time: 1.1 })).every((m) => m.shape === 'pill')).toBe(true);
    expect(at(1).every((m) => m.shape === 'arc')).toBe(true);
    for (const t of [0.1, 0.5, 0.9]) expect(at(t).every((m) => m.shape === 'path')).toBe(true);
  });

  it('morph without a jump: the outline starts at the pill and each step moves a little', () => {
    const outline = (t: number) => {
      const mark = eyesOf(avatarFrame(mug, { mood: 'happy', reducedMotion: true, motionBlend: { from: { state: 'idle' }, t } }))[0];
      return mark.shape === 'path' ? numbers(mark.d) : [];
    };
    const pill = eyesOf(avatarFrame(mug, { reducedMotion: true }))[0];
    if (pill.shape !== 'pill') throw new Error('expected a pill');
    const start = outline(0.001);
    const xs = start.filter((_, i) => i % 2 === 0), ys = start.filter((_, i) => i % 2 === 1);
    expect(Math.min(...xs)).toBeCloseTo(pill.x, 1);
    expect(Math.max(...xs)).toBeCloseTo(pill.x + pill.width, 1);
    expect(Math.min(...ys)).toBeCloseTo(pill.y, 1);
    expect(Math.max(...ys)).toBeCloseTo(pill.y + pill.height, 1);
    let last = start;
    for (let t = 0.05; t < 1; t += 0.05) {
      const next = outline(t);
      expect(next.length).toBe(last.length);
      const step = Math.max(...next.map((v, i) => Math.abs(v - last[i])));
      expect(step).toBeLessThan(1.2);
      last = next;
    }
  });

  it('stay inside the body for every mood, state and look direction, on every starter and gallery avatar', () => {
    const looks = [undefined, { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }, { x: 1, y: 1 }, { x: -1, y: -1 }];
    expect(everyone.length).toBeGreaterThan(examples.length);
    for (const d of everyone) {
      const { polys } = analyzeBody(preparedVolume(d).def.body.path);
      for (const mood of MOODS) {
        // Lids only take ink away, so two states cover the shapes: open eyes, and half-closed ones.
        for (const state of ['idle', 'waiting'] as const) {
          for (const gaze of looks) {
            for (const time of [0.9]) {
              // Seen square on, so face-plane coordinates are the body's own.
              const options: RenderOptions = { state, mood, gaze, time, motionBlend: { from: { state: 'idle', mood: 'surprised' }, t: 0.5 } };
              for (const frame of [avatarFrame(d, { state, mood, gaze, time }), avatarFrame(d, options)]) {
                let outside = 0;
                for (const mark of eyesOf(frame)) {
                  const pts = mark.shape === 'pill'
                    ? [mark.x, mark.y, mark.x + mark.width, mark.y + mark.height, mark.x + mark.width / 2, mark.y + mark.height / 2]
                    : mark.shape === 'path' ? numbers(mark.d) : [];
                  // An outline's numbers are a start point, then a control point and a midpoint per step:
                  // the control points are the outline itself, and the curve lies inside their hull.
                  const step = mark.shape === 'path' ? 4 : 2;
                  for (let i = mark.shape === 'path' ? 2 : 0; i < pts.length; i += step) {
                    // The pill's corners are rounded off; test them a little inside.
                    const inset = mark.shape === 'pill' && i < 4 ? (i === 0 ? 1 : -1) * 0.6 : 0;
                    if (!isInside(polys, pts[i] + inset, pts[i + 1] + inset)) outside++;
                  }
                }
                expect(outside, `${d.id} ${state} ${mood} ${JSON.stringify(gaze)} ${time}`).toBe(0);
              }
            }
          }
        }
      }
    }
  }, 30_000);

  it('open wide when surprised and lower a slanted lid when sad or angry', () => {
    const box = (mood: RenderOptions['mood'], eye: number) => {
      const mark = eyesOf(avatarFrame(mug, { mood, reducedMotion: true }))[eye];
      if (mark.shape === 'pill') return { x0: mark.x, x1: mark.x + mark.width, y0: mark.y, y1: mark.y + mark.height, pts: [] as number[] };
      const n = mark.shape === 'path' ? numbers(mark.d) : [];
      const xs = n.filter((_, i) => i % 2 === 0), ys = n.filter((_, i) => i % 2 === 1);
      return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), pts: n };
    };
    const plain = box('neutral', 0), wide = box('surprised', 0);
    expect(wide.x1 - wide.x0).toBeGreaterThan(plain.x1 - plain.x0);
    expect(wide.y1 - wide.y0).toBeGreaterThan(plain.y1 - plain.y0);
    // Top of the outline at the eye's outer and inner edge: sad is lower outside, angry lower inside.
    const tops = (mood: RenderOptions['mood']) => {
      const b = box(mood, 0), mid = (b.x0 + b.x1) / 2;
      let outer = Infinity, inner = Infinity;
      for (let i = 0; i < b.pts.length; i += 2) {
        if (b.pts[i] < mid - 0.5) outer = Math.min(outer, b.pts[i + 1]);
        if (b.pts[i] > mid + 0.5) inner = Math.min(inner, b.pts[i + 1]);
      }
      return { outer, inner };
    };
    expect(tops('sad').outer).toBeGreaterThan(tops('sad').inner + 0.5);
    expect(tops('angry').inner).toBeGreaterThan(tops('angry').outer + 0.5);
    expect(box('sad', 0).y1).toBeCloseTo(plain.y1, 1);
  });
});

describe('marks', () => {
  it('replace the body: three dots while thinking, an exclamation mark while blocked', () => {
    for (const d of examples) {
      const thinking = avatarFrame(d, { state: 'thinking', time: 0.8 });
      expect(kinds(thinking, isMark).length).toBe(3);
      expect(kinds(thinking, isBody).length).toBe(0);
      expect(eyesOf(thinking).length).toBe(0);
      const blocked = avatarFrame(d, { state: 'blocked', time: 0.8 });
      expect(kinds(blocked, isMark).length).toBe(2);
      expect(kinds(blocked, isBody).length).toBe(0);
      // Every mark's path is listed once, under an id of its own.
      for (const s of [...thinking.shapes, ...blocked.shapes]) {
        if (s.kind === 'slice') expect([...thinking.paths, ...blocked.paths].some((p) => p.id === s.path)).toBe(true);
      }
    }
  });

  it('grow in as the body shrinks away, and something is on screen all the way', () => {
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const frame = avatarFrame(mug, { state: 'blocked', time: 1, motionBlend: { from: { state: 'idle' }, t } });
      expect(frame.shapes.length).toBeGreaterThan(0);
      if (t < 0.3) expect(kinds(frame, isMark).length).toBe(0);
      if (t > 0.7) expect(kinds(frame, isBody).length).toBe(0);
    }
    const early = avatarFrame(mug, { state: 'blocked', time: 1, motionBlend: { from: { state: 'idle' }, t: 0.3 } });
    const full = avatarFrame(mug, { time: 1 });
    const scale = (f: AvatarFrame) => Math.abs((kinds(f, isBody)[0] as { matrix: number[] }).matrix[3]);
    expect(scale(early)).toBeLessThan(scale(full));
  });

  it('hold still under reduced motion and move otherwise', () => {
    const still = (time: number) => JSON.stringify(avatarFrame(mug, { state: 'thinking', time, reducedMotion: true }).shapes);
    expect(still(0.2)).toBe(still(1.4));
    const live = (time: number) => JSON.stringify(avatarFrame(mug, { state: 'thinking', time }).shapes);
    expect(live(0.2)).not.toBe(live(0.5));
  });

  it('show in the scene too, in the front overlay, with the body hidden', () => {
    const frame = sceneFrame(mug, { state: 'blocked', time: 0.4 });
    expect(frame.body).toBe(0);
    expect((frame.front.match(/<path /g) ?? []).length).toBe(2);
    expect(frame.back).toBe('');
    expect(sceneFrame(mug, { time: 0.4 }).front).toBe('');
    expect(frame.front).not.toMatch(/NaN|undefined|Infinity/);
  });
});

describe('ribbons', () => {
  const ribbons = (frame: AvatarFrame) => frame.shapes.flatMap((s) => (s.kind === 'ribbon' ? [s] : []));

  it('circle a working bot, behind the body and in front of it, and no other state at rest', () => {
    let front = 0, back = 0;
    for (let i = 0; i < 20; i++) {
      const frame = avatarFrame(mug, { state: 'working', time: i * 0.13 });
      const all = ribbons(frame);
      expect(all.length).toBeGreaterThan(0);
      front += all.filter((r) => r.tint !== 0).length;
      back += all.filter((r) => r.tint === 0).length;
      // Painted in order: those behind come before every body shape, those in front after.
      const body = frame.shapes.flatMap((s, at) => (s.kind === 'ribbon' ? [] : [at]));
      const first = body[0], lastBody = body[body.length - 1];
      frame.shapes.forEach((s, at) => {
        if (s.kind === 'ribbon') expect(s.tint !== 0 ? at > lastBody : at < first).toBe(true);
      });
    }
    expect(front).toBeGreaterThan(0);
    expect(back).toBeGreaterThan(0);
    for (const state of ['idle', 'thinking', 'waiting', 'blocked', 'done'] as const) expect(ribbons(avatarFrame(mug, { state, time: 1 })).length).toBe(0);
    expect(ribbons(avatarFrame(mug, { state: 'working', time: 1, reducedMotion: true })).length).toBe(0);
  });

  it('are a shade apart from the body in front of it: lighter, or darker on a light body', () => {
    const tints = (color: string) => ribbons(avatarFrame(mug, { state: 'working', time: 0.4, color })).map((r) => r.tint);
    expect(tints('#1f7cf2').some((t) => t > 0)).toBe(true);
    expect(tints('#1f7cf2').every((t) => t >= 0)).toBe(true);
    expect(tints('#f4f4f4').some((t) => t < 0)).toBe(true);
    expect(tints('#f4f4f4').every((t) => t <= 0)).toBe(true);
  });

  it('stay where they are while the body hops and rolls', () => {
    // Inside the frame's root motion a ribbon's matrix undoes it, so on screen it has not moved.
    const frame = avatarFrame(mug, { state: 'working', time: 0.9 });
    const [a, b, c, d, e, f] = frame.root;
    for (const r of ribbons(frame)) {
      const m = r.matrix;
      const on = [a * m[0] + c * m[1], b * m[0] + d * m[1], a * m[2] + c * m[3], b * m[2] + d * m[3], a * m[4] + c * m[5] + e, b * m[4] + d * m[5] + f];
      [1, 0, 0, 1, 0, 0].forEach((v, i) => expect(on[i]).toBeCloseTo(v, 6));
    }
  });

  it('stay within the reach the canvas allows for, on every starter', () => {
    for (const d of examples) {
      const b = preparedVolume(d).vol.bounds;
      const extent = avatarExtent(d);
      const { radius, width } = ribbonReach(b);
      for (let i = 0; i < 40; i++) {
        for (const piece of ribbonPieces(b, 1, 11, i * 0.21)) {
          expect(piece.box.x).toBeGreaterThanOrEqual(extent.x);
          expect(piece.box.y).toBeGreaterThanOrEqual(extent.y);
          expect(piece.box.x + piece.box.w).toBeLessThanOrEqual(extent.x + extent.size);
          expect(piece.box.y + piece.box.h).toBeLessThanOrEqual(extent.y + extent.size);
          expect(Math.max(piece.box.w, piece.box.h)).toBeLessThanOrEqual(2 * (radius + width));
        }
      }
    }
  });

  it('draw out and back in with their presence', () => {
    const b = preparedVolume(mug).vol.bounds;
    expect(ribbonPieces(b, 0, 3, 1)).toEqual([]);
    const area = (k: number) => ribbonPieces(b, k, 3, 1).reduce((n, p) => n + p.box.w * p.box.h, 0);
    expect(area(0.3)).toBeLessThan(area(1));
  });
});

describe('done', () => {
  const base = { seed: 5, time: 4, reducedMotion: false, state: 'done' as const };

  it('turns once as it begins, with ribbons, and is settled after', () => {
    const settled = computePose(base);
    expect(computePose({ ...base, stateAge: DONE_TURN_S })).toEqual(settled);
    expect(computePose({ ...base, stateAge: 60 })).toEqual(settled);
    expect(settled.ribbons).toBe(0);
    const early = computePose({ ...base, stateAge: DONE_TURN_S * 0.25 });
    expect(early.yaw).toBeGreaterThan(settled.yaw + 0.5);
    expect(early.ribbons).toBeGreaterThan(0.5);
    expect(early.lift).toBeLessThan(settled.lift);
    // The turn starts and ends where the settled pose is.
    for (const age of [0, DONE_TURN_S - 1e-6]) {
      const p = computePose({ ...base, stateAge: age });
      expect(Math.cos(p.yaw - settled.yaw)).toBeCloseTo(1, 4);
      expect(p.ribbons).toBeCloseTo(0, 2);
    }
  });

  it('never unwinds: past the half turn the angle counts down to the settled one', () => {
    const settled = computePose(base).yaw;
    for (let u = 0.02; u < 1; u += 0.02) {
      const yaw = computePose({ ...base, stateAge: u * DONE_TURN_S }).yaw - settled;
      expect(Math.abs(yaw)).toBeLessThanOrEqual(Math.PI + 1e-9);
    }
  });

  it('does not turn under reduced motion', () => {
    expect(computePose({ ...base, reducedMotion: true, stateAge: 0.3 })).toEqual(computePose({ ...base, reducedMotion: true }));
  });
});

describe('animator states', () => {
  const step = (a: ReturnType<typeof createAnimator>, now: number, state: RenderOptions['state'], mood: RenderOptions['mood'] = 'neutral') =>
    a.step({ now, state, mood, target: null, reducedMotion: false });

  it('counts a state from when it began, through a change of mood', () => {
    const a = createAnimator();
    // An avatar that mounts in a state has been in it all along.
    expect(step(a, 0, 'done').stateAge).toBe(Infinity);
    expect(step(a, 100, 'working').stateAge).toBe(0);
    expect(step(a, 600, 'working').stateAge).toBeCloseTo(0.5, 9);
    expect(step(a, 700, 'working', 'happy').stateAge).toBeCloseTo(0.6, 9);
    expect(step(a, 800, 'done', 'happy').stateAge).toBe(0);
  });

  it('eases in from the state and mood on screen, with the age that state had', () => {
    const a = createAnimator();
    step(a, 0, 'idle');
    step(a, 1000, 'done');
    const change = step(a, 1300, 'idle', 'sad');
    expect(change.motionBlend).toEqual({ from: { state: 'done', mood: 'neutral', age: 0.3, blend: { from: { state: 'idle', mood: 'neutral', age: Infinity }, t: expect.any(Number) } }, t: 0 });
  });

  it('turns once without a jump when the mood changes mid-turn', () => {
    const a = createAnimator();
    step(a, 0, 'idle');
    let last: number | null = null;
    for (let now = 100; now < 1700; now += 16) {
      const s = step(a, now, 'done', now < 600 ? 'neutral' : now < 900 ? 'happy' : 'sad');
      const yaw = computePose({ seed: 5, time: now / 1000, reducedMotion: false, state: 'done', mood: now < 600 ? 'neutral' : now < 900 ? 'happy' : 'sad', stateAge: s.stateAge, blend: s.motionBlend }).yaw;
      // Compared as directions, so a full turn counts as no change.
      if (last !== null) expect(Math.abs(Math.atan2(Math.sin(yaw - last), Math.cos(yaw - last)))).toBeLessThan(0.25);
      last = yaw;
    }
  });

  it('keeps asking for frames while done is still turning', () => {
    const a = createAnimator();
    step(a, 0, 'idle');
    step(a, 100, 'done');
    expect(step(a, 100 + 700, 'done').moving).toBe(true);
    expect(step(a, 100 + DONE_TURN_S * 1000 + 10, 'done').moving).toBe(false);
  });
});
