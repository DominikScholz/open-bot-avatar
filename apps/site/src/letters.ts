/**
 * What the editor and the embeddable element share: the letters, palettes, word layout, per-letter
 * settings and gradient fills.
 *
 * Every letter on the page is its own instance, keyed "L#0", "L#1" and so on: the letter, then which
 * occurrence of it this is.
 */
import type { AvatarDefinition, AvatarMotion } from 'open-bot-avatar';
import { mountAvatar, type MountedAvatar } from 'open-bot-avatar/dom';
import { drawFill, FILL_SIZE } from './fluid.ts';

const files = import.meta.glob<AvatarDefinition>('../../../gallery/letter-*.json', { eager: true, import: 'default' });
export const defs: Record<string, AvatarDefinition> = {};
for (const def of Object.values(files)) defs[def.name.slice(-1)] = def;
export const LETTERS = Object.keys(defs).sort();

export const PALS = [
  ['#5B8DEF', '#3E6FB0', '#5FC1C9', '#7C8FC7'], ['#B6F24A', '#3EDC6E', '#0FBF8A', '#7BE35B'], ['#8F6BFF', '#5B6CFF', '#C77DFF', '#7FA8FF'],
  ['#FF8A4C', '#FF4F7B', '#E935C1', '#FF6F61'], ['#2EE6C5', '#19B8E6', '#4A7DFF', '#7CF0B0'], ['#FF9AD5', '#FF5FA8', '#C65CFF', '#FFB3A7'],
  ['#FFC233', '#FF9A1F', '#FF6B3D', '#FFAE4D'], ['#6E7BFF', '#3FA9FF', '#A77BFF', '#49D6E8'], ['#FF4B5C', '#D9245F', '#FF7A59', '#A12BD6'],
];
export const MOODS: AvatarMotion[] = ['idle', 'thinking', 'happy', 'angry'];
export const SPACING: Record<string, number> = { overlap: -34, tight: -20, normal: -8, wide: 6 };
export const FLOW: Record<string, number> = { still: 0, slow: 0.4, normal: 1, fast: 2.6 };

/** A palette index, or a picked "#rrggbb" color. */
export type Color = number | string;

export const keyOf = (k: string, occ: number) => `${k}#${occ}`;
export const parts = (key: string) => ({ k: key[0], occ: Number(key.slice(2)) });

// A second L starts on a different palette from the first, so repeats never look identical.
export const defaultColor = (key: string) => {
  const { k, occ } = parts(key);
  return (LETTERS.indexOf(k) + occ * 4) % PALS.length;
};

/** A gradient built around one picked color, by nudging its hue and lightness. */
export function stopsFrom(hex: string): string[] {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
  const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  let h = 0;
  if (d) h = (mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
  const css = (hh: number, ll: number) => {
    const hue = (hh + 360) % 360, L = Math.min(0.92, Math.max(0.08, ll));
    const f = (k: number) => {
      const q = (k + hue / 30) % 12;
      return L - s * Math.min(L, 1 - L) * Math.max(-1, Math.min(q - 3, 9 - q, 1));
    };
    return `#${[f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`;
  };
  return [css(h + 24, l + 0.08), hex, css(h - 26, l - 0.02), css(h + 12, l - 0.1)];
}
export const stopsFor = (color: Color) => (typeof color === 'number' ? PALS[color] : stopsFrom(color));

/** Each instance gets its own id, which gives it its own blink, sway and jump timing. */
export const definitionFor = (key: string): AvatarDefinition => {
  const { k, occ } = parts(key);
  return occ ? { ...defs[k], id: `${defs[k].id}-${occ + 1}` } : defs[k];
};

/* ---------- Word layout ---------- */
export const wordsIn = (text: string) => text.toUpperCase().replace(/[^A-Z ]/g, '').split(/\s+/).filter(Boolean);
export const advanceOf = (spacing: string) => 1 + (SPACING[spacing] ?? SPACING.normal) / 100;

/** The letters of each row and their size, to fit `width` pixels. */
export function layoutWords(words: string[], spacing: string, width: number) {
  const f = advanceOf(spacing);
  const span = (w: string) => 1 + (w.length - 1) * f;
  const oneLine = (width - (words.length - 1) * 22) / words.reduce((s, w) => s + span(w), 0);
  const stacked = Math.min(width / Math.max(...words.map(span)), 340 / words.length);
  const size = Math.max(44, Math.min(190, Math.floor(Math.max(oneLine, stacked))));
  // The small nudge keeps rounding error from pushing a word that exactly fits onto a second row.
  const perRow = Math.max(1, Math.floor((width / size - 1) / f + 1e-6) + 1);
  const rows: string[][] = [];
  for (const w of words) for (let i = 0; i < w.length; i += perRow) rows.push(w.slice(i, i + perRow).split(''));
  return { rows, size, f };
}
/** Earlier letters paint later, so the leftmost letter sits on top when they overlap. */
export const letterCss = (i: number, count: number, size: number, f: number) =>
  `width:${size}px;height:${size}px;margin-left:${i ? Math.round(size * (f - 1)) : 0}px;z-index:${count - i};--glow-size:${Math.max(5, Math.round(size * 0.09))}px`;

/** Gives repeated letters their occurrence: [["L","L"]] becomes [["L#0","L#1"]]. */
export function keysFor(rows: string[][]): string[][] {
  const seen: Record<string, number> = {};
  return rows.map((row) => row.map((k) => keyOf(k, (seen[k] = (seen[k] ?? -1) + 1))));
}

/* ---------- Per-letter settings as text, for the embed code ---------- */
export interface LetterSetting {
  mood?: AvatarMotion;
  color?: Color;
}
/** "L2:happy:3" is the second L, happy, in palette 3. "O::#ff5fa8" sets only a color. */
export function formatLetters(settings: Record<string, LetterSetting>): string {
  return Object.entries(settings)
    .map(([key, s]) => {
      const { k, occ } = parts(key);
      return `${k}${occ ? occ + 1 : ''}:${s.mood ?? ''}:${s.color ?? ''}`.replace(/:$/, '');
    })
    .join(', ');
}
export function parseLetters(text: string): Record<string, LetterSetting> {
  const out: Record<string, LetterSetting> = {};
  for (const entry of text.split(',')) {
    const [name, mood, color] = entry.trim().split(':');
    const match = /^([A-Za-z])(\d*)$/.exec(name ?? '');
    if (!match) continue;
    const setting: LetterSetting = {};
    if ((MOODS as string[]).includes(mood)) setting.mood = mood as AvatarMotion;
    if (/^#[0-9a-f]{6}$/i.test(color ?? '')) setting.color = color;
    else if (/^\d+$/.test(color ?? '') && Number(color) < PALS.length) setting.color = Number(color);
    out[keyOf(match[1].toUpperCase(), Math.max(0, Number(match[2] || 1) - 1))] = setting;
  }
  return out;
}

/* ---------- Gradient fills: one per instance, each flowing on its own path ---------- */
const hash = (s: string) => {
  let h = 7;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
};
interface Fill {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  seed: number;
  stops: string[];
}
const PATTERN_SCALE = new DOMMatrix().scale(128 / FILL_SIZE);
let scratch: CanvasRenderingContext2D | undefined;
export const prefersStill = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export class Fills {
  speed = 1;
  private fills = new Map<string, Fill>();
  private t = 0;
  private last = 0;
  private frame = 0;
  private colorOf: (key: string) => Color;

  constructor(colorOf: (key: string) => Color) {
    this.colorOf = colorOf;
  }
  private get(key: string): Fill {
    let f = this.fills.get(key);
    if (!f) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = FILL_SIZE;
      f = { canvas, ctx: canvas.getContext('2d') as CanvasRenderingContext2D, seed: (hash(key) % 628) / 100, stops: stopsFor(this.colorOf(key)) };
      this.fills.set(key, f);
      drawFill(f.ctx, f.stops, f.seed, this.t);
    }
    return f;
  }
  start() {
    if (this.frame || prefersStill()) return;
    const loop = (now: number) => {
      // The fill runs on its own clock, so changing speed doesn't make the colors jump.
      this.t += (Math.min(100, now - (this.last || now)) / 1000) * this.speed;
      this.last = now;
      if (this.speed > 0) this.fills.forEach((f) => drawFill(f.ctx, f.stops, f.seed, this.t));
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }
  stop() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.last = 0;
  }
  /** Picks up changed colors. */
  refresh() {
    this.fills.forEach((f, key) => {
      f.stops = stopsFor(this.colorOf(key));
      drawFill(f.ctx, f.stops, f.seed, this.t);
    });
  }
  /** Forgets fills that `keep` rejects. */
  prune(keep: (key: string) => boolean) {
    [...this.fills.keys()].forEach((key) => {
      if (!keep(key)) this.fills.delete(key);
    });
  }
  /**
   * A painter for `key`'s fill as it will look `seconds` from now at the current speed, for
   * animated exports. Every call repaints one shared canvas; a pattern copies it when made.
   */
  paintAt(key: string, seconds: number) {
    const { stops, seed } = this.get(key);
    return (ctx: CanvasRenderingContext2D) => {
      scratch ??= document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D;
      scratch.canvas.width = scratch.canvas.height = FILL_SIZE;
      drawFill(scratch, stops, seed, this.t + seconds * this.speed);
      const pattern = ctx.createPattern(scratch.canvas, 'repeat') as CanvasPattern;
      pattern.setTransform(PATTERN_SCALE);
      return pattern;
    };
  }
  paint(key: string) {
    return (ctx: CanvasRenderingContext2D) => {
      const pattern = ctx.createPattern(this.get(key).canvas, 'repeat') as CanvasPattern;
      pattern.setTransform(PATTERN_SCALE);
      return pattern;
    };
  }
}

/* ---------- Mounted letters ---------- */
export interface Item {
  key: string;
  holder: HTMLElement;
  avatar: MountedAvatar;
  el?: HTMLElement;
  boost: number;
  boostTo: number;
}
export function mountLetter(holder: HTMLElement, key: string, fills: Fills, color: Color, mood: AvatarMotion): Item {
  holder.style.setProperty('--glow', stopsFor(color)[1]);
  const avatar = mountAvatar(holder, { definition: definitionFor(key), eyeColor: '#ffffff', followPointer: true, depth: 0, label: '', paint: fills.paint(key), mood });
  return { key, holder, avatar, boost: 1, boostTo: 1 };
}

// Happy and angry eyes are wider, so they can't grow as much without leaving narrow letters.
export const eyeHover = (mood: AvatarMotion) => (mood === 'happy' || mood === 'angry' ? 1.12 : 1.28);
const easing = new Set<Item>();
function easeEyes() {
  for (const item of easing) {
    item.boost += (item.boostTo - item.boost) * (prefersStill() ? 1 : 0.22);
    if (Math.abs(item.boostTo - item.boost) < 0.004) {
      item.boost = item.boostTo;
      easing.delete(item);
    }
    item.avatar.update({ eyeBoost: item.boost });
  }
  if (easing.size) requestAnimationFrame(easeEyes);
}
/** On hover the eyes grow; the CSS grows the letter itself. */
export function growEyesOnHover(target: HTMLElement, item: Item, moodOf: () => AvatarMotion) {
  const set = (to: number) => {
    item.boostTo = to;
    if (!easing.size) requestAnimationFrame(easeEyes);
    easing.add(item);
  };
  target.addEventListener('pointerenter', (e) => {
    if (e.pointerType === 'mouse') set(eyeHover(moodOf()));
  });
  target.addEventListener('pointerleave', () => set(1));
  target.addEventListener('focus', () => {
    if (target.matches(':focus-visible')) set(eyeHover(moodOf()));
  });
  target.addEventListener('blur', () => set(1));
}
