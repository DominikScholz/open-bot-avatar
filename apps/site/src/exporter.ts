/** Still images of a word, and the code that embeds it live on another site. */
import { avatarFrame, type AvatarMotion } from 'open-bot-avatar';
import { framePlacement, paintFrame } from 'open-bot-avatar/dom';
import { advanceOf, definitionFor, keysFor, stopsFor, type Color, type Fills } from './letters.ts';

export interface Word {
  /** Rows of instance keys, one row per word. */
  words: string[];
  spacing: string;
  glow: boolean;
  colorOf: (key: string) => Color;
  moodOf: (key: string) => AvatarMotion;
  fills: Fills;
}

const PADDING = 0.14; // of a letter, room for the glow around the word

function sheet(word: Word, size: number) {
  const rows = keysFor(word.words.map((w) => w.split('')));
  const f = advanceOf(word.spacing);
  const longest = Math.max(...rows.map((r) => 1 + (r.length - 1) * f));
  const pad = size * PADDING;
  return {
    rows,
    width: Math.ceil(longest * size + pad * 2),
    height: Math.ceil(rows.length * size + pad * 2),
    place: (rowIndex: number, i: number, count: number) => ({
      x: pad + ((longest - (1 + (count - 1) * f)) * size) / 2 + i * f * size,
      y: pad + rowIndex * size,
    }),
  };
}
const frameOf = (word: Word, key: string) =>
  avatarFrame(definitionFor(key), { motion: word.moodOf(key), time: 0, depth: 0, reducedMotion: true, eyeColor: '#ffffff', gaze: { x: 0, y: 0 } });

/** A transparent PNG of the word as it looks right now, without motion. */
export function wordToPng(word: Word): Promise<Blob> {
  const span = Math.max(...word.words.map((w) => 1 + (w.length - 1) * advanceOf(word.spacing)));
  const size = Math.round(Math.min(512, 4000 / (span + PADDING * 2)));
  const { rows, width, height, place } = sheet(word, size);
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d') as CanvasRenderingContext2D;
  rows.forEach((row, r) => {
    // Right to left, so the leftmost letter ends up on top.
    [...row].reverse().forEach((key, reversed) => {
      const i = row.length - 1 - reversed;
      const letter = document.createElement('canvas');
      letter.width = letter.height = size;
      const lctx = letter.getContext('2d') as CanvasRenderingContext2D;
      paintFrame(lctx, frameOf(word, key), size / 100, word.fills.paint(key)(lctx), '#ffffff');
      const { x, y } = place(r, i, row.length);
      ctx.filter = word.glow ? `drop-shadow(0 0 ${size * 0.09}px ${stopsFor(word.colorOf(key))[1]}a6)` : 'none';
      ctx.drawImage(letter, x, y);
    });
  });
  return new Promise((resolve, reject) => out.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not create the PNG'))), 'image/png'));
}

const n = (v: number) => +v.toFixed(3);

/** A vector copy of the word. Its gradients approximate the liquid fill, which only exists live. */
export function wordToSvg(word: Word): string {
  const size = 100;
  const { rows, width, height, place } = sheet(word, size);
  const defs: string[] = [];
  const body: string[] = [];
  rows.forEach((row, r) => {
    [...row].reverse().forEach((key, reversed) => {
      const i = row.length - 1 - reversed;
      const { x, y } = place(r, i, row.length);
      const id = key.replace('#', '-');
      const stops = stopsFor(word.colorOf(key));
      const frame = frameOf(word, key);
      const { matrices } = framePlacement(frame);
      const paths = new Map(frame.paths.map((p) => [p.id, p]));
      const clip: string[] = [];
      const eyes: string[] = [];
      frame.shapes.forEach((shape, s) => {
        const matrix = `matrix(${matrices[s].map(n).join(' ')})`;
        if (shape.kind === 'slice') {
          const p = paths.get(shape.path);
          if (p) clip.push(`<path transform="${matrix}" d="${p.d}"${p.evenOdd ? ' clip-rule="evenodd"' : ''}/>`);
        } else if (shape.mark.shape === 'pill') {
          const m = shape.mark;
          eyes.push(`<rect transform="${matrix}" x="${n(m.x)}" y="${n(m.y)}" width="${n(m.width)}" height="${n(m.height)}" rx="${n(m.radius)}" fill="#fff"/>`);
        } else {
          eyes.push(`<path transform="${matrix}" d="${shape.mark.d}" fill="none" stroke="#fff" stroke-width="${n(shape.mark.strokeWidth)}" stroke-linecap="round"/>`);
        }
      });
      defs.push(`<clipPath id="clip-${id}">${clip.join('')}</clipPath>`);
      if (word.glow) defs.push(`<filter id="glow-${id}" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="0" stdDeviation="${n(size * 0.05)}" flood-color="${stops[1]}" flood-opacity=".65"/></filter>`);
      const spots = [[30, 25], [75, 30], [25, 75], [72, 78]];
      stops.forEach((col, c) => defs.push(`<radialGradient id="spot-${id}-${c}" cx="${spots[c][0]}" cy="${spots[c][1]}" r="58" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${col}"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></radialGradient>`));
      const fill = `<rect width="100" height="100" fill="${stops[1]}"/>${stops.map((_, c) => `<rect width="100" height="100" fill="url(#spot-${id}-${c})"/>`).join('')}`;
      body.push(`<g transform="translate(${n(x)} ${n(y)})"${word.glow ? ` filter="url(#glow-${id})"` : ''}><g clip-path="url(#clip-${id})">${fill}</g>${eyes.join('')}</g>`);
    });
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img"><defs>${defs.join('')}</defs>${body.join('')}</svg>\n`;
}

export function saveFile(name: string, data: Blob | string, type = 'image/svg+xml') {
  const url = URL.createObjectURL(typeof data === 'string' ? new Blob([data], { type }) : data);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
