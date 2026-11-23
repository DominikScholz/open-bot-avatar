#!/usr/bin/env node
/**
 * Draw the site's social preview (Open Graph / X card): the name and one line on what it is on the
 * left, on the site's dark background, and a grid of avatars on the right: a row of flat ones over
 * two rows of fluffy ones.
 *
 *   node apps/site/scripts/og.ts
 */
import { writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import { renderAvatarSvg } from '../../../packages/core/src/index.ts';
import { LOGO, LOGO_COLOR } from '../src/logo.ts';
import { BG, BOLD, MUTED, REGULAR, TEXT, avatarRow, avatarStills, num, textPath } from './artwork.ts';

const W = 1200;
const H = 630;
/** The words' left edge; everything keeps about 64px from the edges. */
const M = 72;

// Three to a row, the grid's right edge about as far from the graphic's as the words' left edge is.
const SIZE = 138;
const CELL = 150;
const X = W - M - 2 * CELL - 51;
const AVATARS = [
  ...avatarRow(['ghost', '+chat', 'bull'], 'flat', SIZE, X, H / 2 - CELL + 6, CELL),
  ...avatarRow(['sprout', 'controller', '+brain'], 'fluffy', SIZE, X, H / 2 + 6, CELL),
  ...avatarRow(['magnifier', 'book', 'watering-can'], 'fluffy', SIZE, X, H / 2 + CELL + 6, CELL),
];

const logo = renderAvatarSvg(LOGO, { color: LOGO_COLOR, size: 104, reducedMotion: true })
  .replace('<svg ', `<svg x="${num(M - 10)}" y="104" `)
  .replace(/<title>.*?<\/title>/, '');
const TITLE = 110;
const titleY = 296; // first baseline
const words = [
  textPath(BOLD, 'Open Bot', M, titleY, TITLE, TEXT, -0.03),
  textPath(BOLD, 'Avatar', M, titleY + TITLE, TITLE, TEXT, -0.03),
  textPath(REGULAR, 'A JSON spec and renderer for', M, titleY + TITLE + 74, 32, MUTED),
  textPath(REGULAR, 'interactive agent avatars. MIT.', M, titleY + TITLE + 118, 32, MUTED),
];

const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
  `<rect width="${W}" height="${H}" fill="${BG}"/>${logo}${words.join('')}${await avatarStills(AVATARS)}</svg>`;

const png = new Resvg(svg).render().asPng();
writeFileSync(new URL('../public/og.png', import.meta.url), png);
console.log(`wrote apps/site/public/og.png (${W}×${H}, ${png.length} bytes)`);
