#!/usr/bin/env node
/**
 * Render the logo (src/logo.ts) to the favicon and the README icon.
 *
 *   node apps/site/scripts/icons.ts
 */
import { writeFileSync } from 'node:fs';
import { renderAvatarSvg } from '../../../packages/core/src/index.ts';
import { LOGO, LOGO_COLOR } from '../src/logo.ts';

const svg = `${renderAvatarSvg(LOGO, { color: LOGO_COLOR, reducedMotion: true })}\n`;
for (const out of ['apps/site/public/favicon.svg', 'assets/icon.svg']) {
  writeFileSync(new URL(`../../../${out}`, import.meta.url), svg);
  console.log(`wrote ${out}`);
}
