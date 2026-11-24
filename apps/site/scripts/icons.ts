#!/usr/bin/env node
/**
 * Render the logo (src/logo.ts) to the favicon and the README icon.
 *
 *   node apps/site/scripts/icons.ts
 *
 * The output is compacted to stay under ICON_MAX_BYTES: T3 Code and other hosts cache a project
 * icon as a data URL of at most 32 KB, which a 24 KB SVG fits in once base64-encoded.
 */
import { writeFileSync } from 'node:fs';
import { renderAvatarSvg } from '../../../packages/core/src/index.ts';
import { LOGO, LOGO_COLOR } from '../src/logo.ts';

const ICON_MAX_BYTES = 24_000;

/** Numbers as the core writes them: no leading zero, no trailing zeros. */
const num = (n: number) => {
  const s = (Math.round(n * 10) / 10).toString();
  return s.replace(/^(-?)0\./, '$1.');
};

/** Joins numbers the short way: a minus sign or a leading dot after a fraction needs no space. */
function join(values: number[]): string {
  let out = '';
  let prev = '';
  for (const v of values) {
    const s = num(v);
    if (out && !(s.startsWith('-') || (s.startsWith('.') && prev.includes('.')))) out += ' ';
    out += s;
    prev = s;
  }
  return out;
}

const ARITY: Record<string, number> = { M: 2, L: 2, T: 2, Q: 4, C: 6 };

/**
 * Rewrites path data with every point rounded to 0.1 viewBox units, in relative commands taken
 * between the rounded points, so rounding never adds up along the outline. Handles the commands
 * the renderer writes: M, L, Q, T, C and Z, absolute or relative.
 *
 * A T's control point is the previous one mirrored about the current point, so a rounding error
 * would double at every link of a chain of T's. Each Q or T end point is rounded to cancel the
 * error its control point carries, which keeps every control point within 0.1 of where it was.
 */
function compactPath(d: string): string {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) ?? [];
  let i = 0;
  let cmd = '';
  let x = 0, y = 0, sx = 0, sy = 0; // exact current point and subpath start
  let rx = 0, ry = 0, rsx = 0, rsy = 0; // the same, rounded as written
  let qx = 0, qy = 0, rqx = 0, rqy = 0; // last quadratic control point, exact and as written
  let quadratic = false; // whether the last segment was a Q or T
  let out = '';
  let lastOut = '';
  const round = (n: number) => Math.round(n * 10) / 10;
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    const upper = cmd.toUpperCase();
    if (upper === 'Z') {
      out += 'Z';
      lastOut = 'Z';
      x = sx; y = sy; rx = rsx; ry = rsy;
      quadratic = false;
      continue;
    }
    const arity = ARITY[upper];
    if (!arity) throw new Error(`icons: unsupported path command ${cmd}`);
    const rel = cmd !== upper;
    const abs: number[] = [];
    for (let k = 0; k < arity; k += 2) {
      const px = Number(tokens[i++]), py = Number(tokens[i++]);
      abs.push(rel ? x + px : px, rel ? y + py : py);
    }
    const rounded = abs.map(round);
    if (upper === 'Q' || upper === 'T') {
      // The control point as drawn: written for Q, mirrored from the last one for T.
      const [cx, cy] = upper === 'Q' ? [abs[0], abs[1]] : quadratic ? [2 * x - qx, 2 * y - qy] : [x, y];
      const [rcx, rcy] = upper === 'Q' ? [rounded[0], rounded[1]] : quadratic ? [2 * rx - rqx, 2 * ry - rqy] : [rx, ry];
      const e = arity - 2;
      // The next T's control error is 2·(end error) − (this control's error): aim the end at half of it.
      rounded[e] = round(abs[e] + (rcx - cx) / 2);
      rounded[e + 1] = round(abs[e + 1] + (rcy - cy) / 2);
      qx = cx; qy = cy; rqx = rcx; rqy = rcy;
      quadratic = true;
    } else {
      quadratic = false;
    }
    const deltas = rounded.map((v, k) => v - (k % 2 === 0 ? rx : ry));
    // The first move stays absolute; after it everything is relative.
    const first = out === '';
    const letter = first ? 'M' : upper === 'M' ? 'm' : upper.toLowerCase();
    // A repeated command needs no letter, except a move, whose repeats would mean lines.
    const repeat = letter === lastOut && letter !== 'm' && letter !== 'M';
    out += (repeat ? (num(first ? rounded[0] : deltas[0]).startsWith('-') ? '' : ' ') : letter) + join(first ? rounded : deltas);
    // Numbers after a move without a letter are lines, absolute after M and relative after m.
    lastOut = letter === 'M' ? 'L' : letter === 'm' ? 'l' : letter;
    x = abs[arity - 2]; y = abs[arity - 1];
    rx = rounded[arity - 2]; ry = rounded[arity - 1];
    if (upper === 'M') {
      sx = x; sy = y; rsx = rx; rsy = ry;
      cmd = rel ? 'l' : 'L'; // implicit repeats of a move are lines
    }
  }
  return out;
}

/** Shorter ids, rounded outlines, and each run of slices that share a slant drawn in one group. */
function compact(svg: string): string {
  const ids = new Map<string, string>();
  const short = (id: string) => {
    let s = ids.get(id);
    if (!s) ids.set(id, (s = `p${ids.size.toString(36)}`));
    return s;
  };
  let out = svg.replace(/<path id="([^"]+)" d="([^"]+)"/g, (_, id: string, d: string) => `<path id="${short(id)}" d="${compactPath(d)}"`);
  out = out.replace(/((?:<use href="#[^"]+" transform="matrix\([^)]+\)"\/>)+)/g, (run: string) => {
    const uses = [...run.matchAll(/<use href="#([^"]+)" transform="matrix\(([^)]+)\)"\/>/g)].map((m) => ({
      id: short(m[1]),
      m: m[2].split(/[ ,]+/).map(Number),
    }));
    let html = '';
    let k = 0;
    while (k < uses.length) {
      const [a, b, c, dd] = uses[k].m;
      let end = k;
      while (end < uses.length && uses[end].m.slice(0, 4).every((v, j) => v === uses[k].m[j])) end++;
      const det = a * dd - b * c;
      html += `<g transform="matrix(${[a, b, c, dd].join(' ')} 0 0)">`;
      for (const u of uses.slice(k, end)) {
        // The translation, in the group's own units: (x, y) = M⁻¹ (e, f).
        const [e, f] = u.m.slice(4);
        const ux = (dd * e - c * f) / det, uy = (a * f - b * e) / det;
        const pos = (n: number) => Math.round(n * 100) / 100;
        html += `<use href="#${u.id}"${pos(ux) ? ` x="${pos(ux)}"` : ''}${pos(uy) ? ` y="${pos(uy)}"` : ''}/>`;
      }
      html += '</g>';
      k = end;
    }
    return html;
  });
  return out;
}

const svg = `${compact(renderAvatarSvg(LOGO, { color: LOGO_COLOR, reducedMotion: true }))}\n`;
const bytes = Buffer.byteLength(svg);
if (bytes > ICON_MAX_BYTES) throw new Error(`icons: the icon is ${bytes} bytes, over the ${ICON_MAX_BYTES} limit`);
for (const out of ['apps/site/public/favicon.svg', 'assets/icon.svg']) {
  writeFileSync(new URL(`../../../${out}`, import.meta.url), svg);
  console.log(`wrote ${out} (${bytes} bytes)`);
}
