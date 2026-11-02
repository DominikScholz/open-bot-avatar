import { describe, expect, it } from 'vitest';
import { examples, renderAvatarSvg, type AvatarDefinition } from 'open-bot-avatar';
import { THUMB_LOOK, THUMB_VIEW, outlineSvg } from '../src/studio/outline.ts';

const count = (s: string, re: RegExp) => s.match(re)?.length ?? 0;

describe('thumbnail selection ring', () => {
  it.each(examples.map((e) => [e.id, e] as const))('%s: built from the still’s slices only', (_, def) => {
    const ring = outlineSvg(def);
    const still = renderAvatarSvg(def, { motion: 'idle', time: 0, reducedMotion: true, view: THUMB_VIEW, gaze: THUMB_LOOK });
    expect(ring).toMatch(/^<svg [^>]*viewBox="0 0 100 100"[^>]*aria-hidden="true"/);
    expect(count(ring, /<mask /g)).toBe(1);
    // Every slice twice (mask + ring), nothing else drawn: the mask's backdrop is the only rect, no eyes.
    expect(count(ring, /<use /g)).toBe(2 * count(still, /<use /g));
    expect(count(ring, /<rect /g)).toBe(1);
    expect(ring).not.toMatch(/<g transform="[^"]*"><(rect|path)/);
    // Its ids are its own and every reference resolves.
    const ids = [...ring.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(still).not.toContain(`id="${id}"`);
    for (const [, ref] of ring.matchAll(/(?:href="#|url\(#)([^")]+)/g)) expect(ids).toContain(ref);
  });

  it('is memoized and color-independent', () => {
    const def = examples[0];
    expect(outlineSvg(def)).toBe(outlineSvg(JSON.parse(JSON.stringify(def)) as AvatarDefinition));
    expect(outlineSvg(def)).not.toMatch(/#[0-9a-f]{3,6}"/i);
  });

  it('is empty for a definition that cannot render', () => {
    expect(outlineSvg({ ...examples[0], id: 'broken', body: { path: 'M0 0Z' } })).toBe('');
  });
});
