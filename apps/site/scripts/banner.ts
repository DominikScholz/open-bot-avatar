#!/usr/bin/env node
/**
 * Draw the README banner (assets/banner.png): the name and a tagline in Geist, as outlines, next to
 * the starters and gallery avatars in their own colors. Rasterizers don't load web fonts, so the
 * letters are paths. 1280×400, written at 2× (2560×800).
 *
 *   node apps/site/scripts/banner.ts
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Resvg } from '@resvg/resvg-js';
import opentype from 'opentype.js';
import { examples, renderAvatarSvg, validateAvatar } from '../../../packages/core/src/index.ts';
import type { AvatarDefinition, AvatarMotion } from '../../../packages/core/src/index.ts';

const W = 1280;
const H = 400;
const SCALE = 2;
const RADIUS = 24;
const BG = '#111111';
const TEXT = '#f2f2f2';
const MUTED = '#9a9a9a';

const require = createRequire(import.meta.url);
const loadFont = (weight: number) => {
  const bytes = readFileSync(require.resolve(`@fontsource/geist/files/geist-latin-${weight}-normal.woff`));
  return opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
};

/** One decimal, never "-0": opentype.js's own toPathData can glue numbers together around -0. */
const num = (v: number) => {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? '0' : String(r);
};
/** Outline of a line of text with its baseline at (x, y), y down; letterSpacing in em. */
const outline = (font: opentype.Font, text: string, x: number, y: number, size: number, letterSpacing = 0) =>
  font
    .getPath(text, x, y, size, { letterSpacing })
    .commands.map((c) => {
      if (c.type === 'Z') return 'Z';
      const points = c.type === 'C' ? [c.x1, c.y1, c.x2, c.y2, c.x, c.y] : c.type === 'Q' ? [c.x1, c.y1, c.x, c.y] : [c.x, c.y];
      return `${c.type}${points.map(num).join(' ')}`;
    })
    .join('');

// Avatars: the starters, then the gallery, each in its own color.
const gallery = new URL('../../../gallery/', import.meta.url);
const colors: Record<string, string> = JSON.parse(readFileSync(new URL('colors.json', gallery), 'utf8'));
const definitions = new Map<string, AvatarDefinition>(examples.map((d) => [d.id, d]));
for (const file of readdirSync(gallery).filter((f) => f.endsWith('.json') && f !== 'colors.json').sort()) {
  const result = validateAvatar(JSON.parse(readFileSync(new URL(file, gallery), 'utf8')));
  if (!result.ok) throw new Error(`gallery/${file}: ${result.errors.join('; ')}`);
  definitions.set(result.value.id, result.value);
}

// A staggered grid on the right, bleeding off the right edge; ids chosen so neighbors differ in color.
const ROWS: string[][] = [
  ['ghost', 'controller', 'sprout', 'chat', 'magnifier', 'lightbulb'],
  ['rocket', 'brain', 'star', 'watering-can', 'barbell'],
  ['shield', 'cat', 'witch-hat', 'paint-brush', 'mug', 'bull'],
];
const HAPPY = new Set(['cat', 'star', 'sprout', 'mug']);
const CELL = 124; // px between avatar centers in a row
const ROW_H = 128;
const SIZE = 116;
const GRID_X = 650; // center of the first avatar in an unshifted row
const GRID_Y = H / 2 - ROW_H;

const avatars = ROWS.flatMap((row, r) =>
  row.map((id, c) => {
    const def = definitions.get(id);
    if (!def) throw new Error(`unknown avatar ${id}`);
    const cx = GRID_X + c * CELL + (r % 2 ? CELL / 2 : 0);
    const cy = GRID_Y + r * ROW_H;
    // Everyone looks toward the name, a little more the farther away they are.
    const gaze = { x: -0.45 - c * 0.06, y: (H / 2 - cy) / H };
    const motion: AvatarMotion = HAPPY.has(id) ? 'happy' : 'idle';
    const svg = renderAvatarSvg(def, { color: colors[id], size: SIZE, reducedMotion: true, gaze, motion })
      .replace(/<title>[^<]*<\/title>/, '')
      .replace('<svg ', `<svg x="${num(cx - SIZE / 2)}" y="${num(cy - SIZE / 2)}" `);
    return svg;
  }),
);

const bold = loadFont(600);
const regular = loadFont(400);
const TX = 72;
const title = outline(bold, 'Open Bot Avatar', TX, 186, 64, -0.025);
const tagline =
  outline(regular, 'A JSON spec and renderer for', TX + 2, 232, 24) + outline(regular, 'interactive agent avatars', TX + 2, 264, 24);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <clipPath id="card"><rect width="${W}" height="${H}" rx="${RADIUS}"/></clipPath>
</defs>
<g clip-path="url(#card)">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  ${avatars.join('\n  ')}
  <path d="${title}" fill="${TEXT}"/>
  <path d="${tagline}" fill="${MUTED}"/>
</g>
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="${RADIUS - 0.5}" fill="none" stroke="#fff" stroke-opacity="0.08"/>
</svg>
`;

const png = new Resvg(svg, { fitTo: { mode: 'width', value: W * SCALE } }).render().asPng();
writeFileSync(new URL('../../../assets/banner.png', import.meta.url), png);
console.log(`wrote assets/banner.png (${W * SCALE}×${H * SCALE}, ${png.length} bytes)`);
