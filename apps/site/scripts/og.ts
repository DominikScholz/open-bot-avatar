#!/usr/bin/env node
/**
 * Draw the site's social preview (Open Graph / X card): the name, one line on what it is and a group
 * of avatars, on the site's dark background. Text is drawn as Geist outlines, since the rasterizer
 * has no web fonts.
 *
 *   node apps/site/scripts/og.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Resvg } from '@resvg/resvg-js';
import opentype from 'opentype.js';
import { examples, renderAvatarSvg, type AvatarDefinition } from '../../../packages/core/src/index.ts';
import { LOGO, LOGO_COLOR } from '../src/logo.ts';

const W = 1200;
const H = 630;
const BG = '#111111';
const TEXT = '#f2f2f2';
const MUTED = '#9a9a9a';

const require = createRequire(import.meta.url);
const loadFont = (weight: number) => {
  const bytes = readFileSync(require.resolve(`@fontsource/geist/files/geist-latin-${weight}-normal.woff`));
  return opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
};
const bold = loadFont(600);
const regular = loadFont(400);

/** One decimal, never "-0": opentype.js's own toPathData can glue numbers together around -0. */
const num = (v: number) => {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? '0' : String(r);
};

/** A line of text as one path, its baseline's left end at (x, y). */
function textPath(font: ReturnType<typeof opentype.parse>, text: string, x: number, y: number, size: number, fill: string, letterSpacing = 0) {
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

// The avatars: core's examples plus the gallery, each in its own color.
const gallery = new URL('../../../gallery/', import.meta.url);
const colors: Record<string, string> = JSON.parse(readFileSync(new URL('colors.json', gallery), 'utf8'));
const byId = new Map<string, AvatarDefinition>(examples.map((d) => [d.id, d]));
for (const id of Object.keys(colors)) {
  if (byId.has(id)) continue;
  byId.set(id, JSON.parse(readFileSync(new URL(`${id}.json`, gallery), 'utf8')));
}

/** Nest a rendered avatar <svg> at (x, y), its ids prefixed so the defs of several avatars don't collide. */
const place = (svg: string, x: number, y: number, prefix: string) =>
  svg
    .replace('<svg ', `<svg x="${num(x)}" y="${num(y)}" `)
    .replace(/<title>.*?<\/title>/, '')
    .replace(/\bid="([^"]+)"/g, `id="${prefix}-$1"`)
    .replace(/href="#([^"]+)"/g, `href="#${prefix}-$1"`);

// Layout: words on the left, avatars on the right, at least 64px from every edge.
const M = 72;

/** Rows of avatar ids; `+` in front shows that one happy. The others look toward the name. */
const GRID = [
  ['ghost', '+chat', 'bull'],
  ['sprout', 'controller', '+brain'],
  ['magnifier', 'book', 'watering-can'],
];
const CELL = 150;
const gridX = W - M - CELL * GRID[0].length + 24;
const gridY = (H - CELL * GRID.length) / 2 + 6;
const avatars = GRID.flatMap((row, r) =>
  row.map((spec, c) => {
    const happy = spec.startsWith('+');
    const id = spec.replace(/^\+/, '');
    const definition = byId.get(id);
    if (!definition) throw new Error(`unknown avatar ${id}`);
    const svg = renderAvatarSvg(definition, {
      color: colors[id],
      size: CELL - 12,
      ...(happy ? { motion: 'happy', time: 0.6 } : { reducedMotion: true, gaze: { x: -0.7, y: 0.1 } }),
    });
    return place(svg, gridX + c * CELL + 6, gridY + r * CELL + 6, id);
  }),
);

const logo = place(renderAvatarSvg(LOGO, { color: LOGO_COLOR, size: 104, reducedMotion: true }), M - 10, 104, 'logo');
const TITLE = 110;
const titleY = 296; // first baseline
const words = [
  textPath(bold, 'Open Bot', M, titleY, TITLE, TEXT, -0.03),
  textPath(bold, 'Avatar', M, titleY + TITLE, TITLE, TEXT, -0.03),
  textPath(regular, 'A JSON spec and renderer for', M, titleY + TITLE + 74, 32, MUTED),
  textPath(regular, 'interactive agent avatars. MIT.', M, titleY + TITLE + 118, 32, MUTED),
];

const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
  `<rect width="${W}" height="${H}" fill="${BG}"/>${logo}${words.join('')}${avatars.join('')}</svg>`;

const png = new Resvg(svg).render().asPng();
writeFileSync(new URL('../public/og.png', import.meta.url), png);
console.log(`wrote apps/site/public/og.png (${W}×${H}, ${png.length} bytes)`);
