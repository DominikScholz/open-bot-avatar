/**
 * What the site's drawn graphics (og.ts, banner.ts) share: the palette, Geist as outlines, since
 * the rasterizer has no web fonts, and stills of the avatars, flat or plush, from headless
 * Chromium (CHROME_BIN may point to it).
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import opentype from 'opentype.js';
import { runInChrome } from './chrome.mjs';
import type { Still, StillSpec } from './render-stills.ts';

export const BG = '#111111';
export const TEXT = '#f2f2f2';
export const MUTED = '#9a9a9a';

/** Each starter's and gallery avatar's own color, by id. */
export const COLORS: Record<string, string> = JSON.parse(readFileSync(new URL('../../../gallery/colors.json', import.meta.url), 'utf8'));

const require = createRequire(import.meta.url);
const loadFont = (weight: number) => {
  const bytes = readFileSync(require.resolve(`@fontsource/geist/files/geist-latin-${weight}-normal.woff`));
  return opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
};
export const BOLD = loadFont(600);
export const REGULAR = loadFont(400);

/** One decimal, never "-0": opentype.js's own toPathData can glue numbers together around -0. */
export const num = (v: number) => {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? '0' : String(r);
};

/** A line of text as one path, its baseline's left end at (x, y); letterSpacing in em. */
export function textPath(font: opentype.Font, text: string, x: number, y: number, size: number, fill: string, letterSpacing = 0): string {
  const d = font
    .getPath(text, x, y, size, { letterSpacing })
    .commands.map((c) => {
      if (c.type === 'Z') return 'Z';
      const points = c.type === 'C' ? [c.x1, c.y1, c.x2, c.y2, c.x, c.y] : c.type === 'Q' ? [c.x1, c.y1, c.x, c.y] : [c.x, c.y];
      return `${c.type}${points.map(num).join(' ')}`;
    })
    .join('');
  return `<path fill="${fill}" d="${d}"/>`;
}

/** An avatar in a graphic: which one, in which material and pose, and where its center goes. */
export interface Placed extends Omit<StillSpec, 'color'> {
  cx: number;
  cy: number;
}

/**
 * A row of avatars of one material and size, at rest and looking to the left, where the name
 * stands: the first one's center at (x, cy), then one every `step` px. `+` in front of an id shows
 * that one happy.
 */
export const avatarRow = (ids: string[], material: StillSpec['material'], size: number, x: number, cy: number, step: number): Placed[] =>
  ids.map((id, i) => ({
    id: id.replace(/^\+/, ''),
    material,
    size,
    cx: x + i * step,
    cy,
    gaze: { x: -0.6, y: 0.05 },
    reducedMotion: true,
    ...(id.startsWith('+') ? { mood: 'happy' as const } : {}),
  }));

/**
 * The avatars as <image> elements, each in its own color. Drawn by the studio's canvas renderer
 * at twice the graphic's size, so fur stays fine when the graphic is 1×.
 */
export async function avatarStills(avatars: Placed[]): Promise<string> {
  const specs = avatars.map(({ cx: _cx, cy: _cy, ...spec }): StillSpec => ({ ...spec, color: COLORS[spec.id] }));
  const { stills }: { stills: Still[] } = await runInChrome('render-stills.ts', specs, 2);
  return stills
    .map(({ png, left, top, width, height }, i) => {
      const { cx, cy, size } = avatars[i];
      return `<image x="${num(cx - size / 2 + left)}" y="${num(cy - size / 2 + top)}" width="${num(width)}" height="${num(height)}" href="${png}"/>`;
    })
    .join('');
}
