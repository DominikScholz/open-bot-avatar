#!/usr/bin/env node
/**
 * Draw the README banner (assets/banner.png): the name and a tagline on the left, and avatars in
 * their own colors on the right, in staggered rows that run off the edge: a row of flat ones over
 * two rows of plush ones. 1280×400, written at 2× (2560×800).
 *
 *   node apps/site/scripts/banner.ts
 */
import { writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import { BG, BOLD, MUTED, REGULAR, TEXT, avatarRow, avatarStills, textPath } from './artwork.ts';

const W = 1280;
const H = 400;
const SCALE = 2;
const RADIUS = 24;

// Ids chosen so no two neighbors, along a row or across rows, are close in color.
const SIZE = 116;
const CELL = 124;
const X = 650;
const ROW_H = 128;
const AVATARS = [
  ...avatarRow(['ghost', 'controller', 'magnifier', 'lightbulb', '+chat', 'bull'], 'flat', SIZE, X, H / 2 - ROW_H, CELL),
  ...avatarRow(['rocket', 'paint-brush', '+mug', 'brain', 'watering-can'], 'plush', SIZE, X + CELL / 2, H / 2, CELL),
  ...avatarRow(['+cat', 'bunny', 'shield', '+sprout', 'star', 'egg'], 'plush', SIZE, X, H / 2 + ROW_H, CELL),
];

const TX = 72;
const words = [
  textPath(BOLD, 'Open Bot Avatar', TX, 186, 64, TEXT, -0.025),
  textPath(REGULAR, 'A JSON spec and renderer for', TX + 2, 232, 24, MUTED),
  textPath(REGULAR, 'interactive agent avatars', TX + 2, 264, 24, MUTED),
];

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <clipPath id="card"><rect width="${W}" height="${H}" rx="${RADIUS}"/></clipPath>
</defs>
<g clip-path="url(#card)">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  ${await avatarStills(AVATARS)}
  ${words.join('')}
</g>
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="${RADIUS - 0.5}" fill="none" stroke="#fff" stroke-opacity="0.08"/>
</svg>
`;

const png = new Resvg(svg, { fitTo: { mode: 'width', value: W * SCALE } }).render().asPng();
writeFileSync(new URL('../../../assets/banner.png', import.meta.url), png);
console.log(`wrote assets/banner.png (${W * SCALE}×${H * SCALE}, ${png.length} bytes)`);
