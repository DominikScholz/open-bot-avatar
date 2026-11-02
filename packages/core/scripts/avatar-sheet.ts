#!/usr/bin/env node
/**
 * Write a static HTML contact sheet of avatars across poses, colors and sizes
 * for visual review. Opens no server; view the file directly.
 *
 *   node scripts/avatar-sheet.ts [out.html] [extra-definition.json ...]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { examples } from '../src/examples.ts';
import { renderAvatarSvg } from '../src/render.ts';
import { validateAvatar } from '../src/validate.ts';
import type { AvatarDefinition, RenderOptions } from '../src/types.ts';

const [out = 'avatar-sheet.html', ...extra] = process.argv.slice(2);
const defs: AvatarDefinition[] = [...examples];
for (const file of extra) {
  const res = validateAvatar(JSON.parse(readFileSync(file, 'utf8')));
  if (!res.ok) {
    console.error(`${file}:\n  ${res.errors.join('\n  ')}`);
    process.exit(1);
  }
  defs.push(res.value);
}

const palette = ['#ff6a1a', '#1f7cf2', '#1fbf68', '#f8a01c', '#8b5cf6', '#ec4899', '#14b3a5'];
const variants: [string, RenderOptions][] = [
  ['rest', { reducedMotion: true }],
  ['front', { reducedMotion: true, view: { yaw: 0.3, pitch: -0.2 } }],
  ['turned 60°', { reducedMotion: true, view: { yaw: 1.35, pitch: -0.1 } }],
  ['side', { reducedMotion: true, view: { yaw: 1.87, pitch: -0.2 } }],
  ['back', { reducedMotion: true, view: { yaw: 3.4, pitch: -0.1 } }],
  ['thinking', { motion: 'thinking', time: 0.8 }],
  ['happy', { motion: 'happy', time: 0.25 }],
];

const rows = defs.map((def, i) => {
  const color = palette[i % palette.length];
  const cells = variants
    .map(([label, o]) => `<figure>${renderAvatarSvg(def, { color, size: 140, ...o })}<figcaption>${label}</figcaption></figure>`)
    .join('');
  const small = [40, 28].map((s) => renderAvatarSvg(def, { color, size: s })).join('');
  const dark = renderAvatarSvg(def, { color: '#7a7a7a', size: 64 });
  return `<section><h2>${def.name}</h2><div class="row">${cells}<figure class="small">${small}${dark}<figcaption>40 / 28 / gray</figcaption></figure></div></section>`;
});

writeFileSync(
  out,
  `<!doctype html><meta charset="utf-8"><title>Avatar sheet</title><style>
body{font:13px system-ui;background:#111;margin:16px;color:#999}h2{font-size:14px;margin:8px 0 2px}
.row{display:flex;gap:6px;align-items:flex-end}figure{margin:0;text-align:center;background:#1f1f1f;border-radius:12px;padding:4px}
figcaption{font-size:11px;color:#888}.small{display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px}
</style>${rows.join('')}`,
);
console.error(`wrote ${out} (${defs.length} avatars)`);
