#!/usr/bin/env node
/**
 * Validate an avatar definition and optionally render a preview SVG.
 *
 *   node scripts/avatar-validate.ts <file.json|->  [--strict] [--svg out.svg] [--color #hex] [--motion idle|thinking|happy] [--time s]
 *
 * Prints the normalized compact JSON on success (exit 0) or one error per line (exit 1).
 * Also reports the face room as drawn (enlarged eyes, happy arcs, gaze); with
 * --strict a face below the design target (FACE_ROOM_TARGET), or a small
 * accidental step where parts meet (see seams.ts), is an error too.
 * Accepts a bare definition object, or text containing a ```json fenced block.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { analyzeBody, validateAvatar } from '../src/validate.ts';
import { EYE_BOOST, FACE_ROOM_TARGET, faceRoom } from '../src/volume.ts';
import { renderAvatarSvg } from '../src/render.ts';
import { silhouetteSeams } from '../src/seams.ts';
import type { AvatarMotion } from '../src/types.ts';

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const strictAt = args.indexOf('--strict');
const strict = strictAt >= 0;
if (strict) args.splice(strictAt, 1);
const svgOut = flag('--svg');
const color = flag('--color');
const motion = flag('--motion') as AvatarMotion | undefined;
const time = flag('--time');
const src = args[0];
if (!src) {
  console.error('usage: node scripts/avatar-validate.ts <file.json|-> [--strict] [--svg out.svg] [--color #hex] [--motion m] [--time s]');
  process.exit(2);
}

const raw = readFileSync(src === '-' ? 0 : src, 'utf8');
const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(raw);
let input: unknown;
try {
  input = JSON.parse(fenced ? fenced[1] : raw);
} catch (err) {
  console.error(`error: not valid JSON (${(err as Error).message})`);
  process.exit(1);
}

const res = validateAvatar(input);
if (!res.ok) {
  for (const e of res.errors) console.error(`error: ${e}`);
  process.exit(1);
}

const body = analyzeBody(res.value.body.path);
const b = body.bounds;
const face = faceRoom(res.value, body);
const g = face.gaze;
const r1 = (n: number) => Math.round(n * 10) / 10;
console.error(
  `ok: bounds x ${r1(b.minX)}..${r1(b.maxX)} y ${r1(b.minY)}..${r1(b.maxY)}, area ${body.area}; ` +
  `face: eyes drawn ${face.boost}x, clearance ${face.clearance}, gaze L${g.left} R${g.right} U${g.up} D${g.down}`,
);
if (!face.ok) {
  const msg =
    `face room below target: drawn eyes need ${EYE_BOOST}x size, >= ${FACE_ROOM_TARGET} units clearance and full gaze. ` +
    'Enlarge the part that carries the eyes (thicker, wider), or move the eyes to its calm center; do not shrink the eyes.';
  console.error(`${strict ? 'error' : 'note'}: ${msg}`);
  if (strict) process.exit(1);
}
const seams = silhouetteSeams(body.polys);
if (seams.length) {
  const where = seams.map((s) => `${s.side} at ${s.side === 'left' || s.side === 'right' ? 'y' : 'x'} ${r1(s.at)} (${r1(Math.abs(s.size))} units)`).join(', ');
  const msg =
    `small silhouette steps where parts meet: ${where}. Make each join a clear step (about 3 units or more) ` +
    'or a smooth, flush continuation with the rounded corners buried inside the neighboring part.';
  console.error(`${strict ? 'error' : 'note'}: ${msg}`);
  if (strict) process.exit(1);
}
console.log(JSON.stringify(res.value));

if (svgOut) {
  writeFileSync(svgOut, renderAvatarSvg(res.value, { color, motion, time: time ? Number(time) : 0, size: 256 }));
  console.error(`wrote ${svgOut}`);
}
