#!/usr/bin/env node
/**
 * Draw the page's watermark tile (site.css): the name in Geist Mono, as outlines. An SVG used as a
 * background image can't load web fonts, so the letters are paths and the tile looks the same
 * everywhere without loading a font.
 *
 *   node apps/site/scripts/watermark.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import opentype from 'opentype.js';

const TEXT = 'Open Bot Avatar';
const SIZE = 13; // px
const GAP = 34; // px between names in a row
const ROW = 28; // px between rows
const OPACITY = 0.024;

const require = createRequire(import.meta.url);
const file = require.resolve('@fontsource/geist-mono/files/geist-mono-latin-500-normal.woff');
const bytes = readFileSync(file);
const font = opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));

const width = font.getAdvanceWidth(TEXT, SIZE);
const period = Math.round(width + GAP);
const tileW = period;
const tileH = ROW * 2;
// Two rows, the second shifted half a name along; a name crossing the tile's edge is drawn on both sides.
const baseline = (row: number) => ROW * row + ROW * 0.5 + SIZE * 0.35;
const placements: [number, number][] = [
  [0, baseline(0)],
  [period / 2, baseline(1)],
  [period / 2 - period, baseline(1)],
];
/** One decimal, never "-0": opentype.js's own toPathData can glue numbers together around -0. */
const num = (v: number) => {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? '0' : String(r);
};

// The name's outline once, at the origin (y down, baseline at 0); each placement reuses it.
const d = font
  .getPath(TEXT, 0, 0, SIZE)
  .commands.map((c) => {
    if (c.type === 'Z') return 'Z';
    const points = c.type === 'C' ? [c.x1, c.y1, c.x2, c.y2, c.x, c.y] : c.type === 'Q' ? [c.x1, c.y1, c.x, c.y] : [c.x, c.y];
    return `${c.type}${points.map(num).join(' ')}`;
  })
  .join('');
const uses = placements.map(([x, y]) => `<use href="#n" x="${+x.toFixed(1)}" y="${+y.toFixed(1)}"/>`).join('');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${tileW}" height="${tileH}" viewBox="0 0 ${tileW} ${tileH}"><defs><path id="n" d="${d}"/></defs><g fill="#fff" fill-opacity="${OPACITY}">${uses}</g></svg>\n`;
writeFileSync(new URL('../src/watermark.svg', import.meta.url), svg);
console.log(`wrote apps/site/src/watermark.svg (${tileW}×${tileH}, ${svg.length} bytes)`);
