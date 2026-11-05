/**
 * The embeddable <alphabet-avatar> element: one script tag and one tag put a live word on any page.
 *
 *   <alphabet-avatar text="hello" spacing="tight" flow="slow" glow="on"
 *     emotion="happy" letters="H:angry, L2::3, O::#ff5fa8"></alphabet-avatar>
 */
import { FLOW, Fills, defaultColor, growEyesOnHover, keysFor, layoutWords, letterCss, mountLetter, parseLetters, stopsFor, wordsIn, type Color, type Item, type LetterSetting } from './letters.ts';
import type { AvatarMotion } from 'open-bot-avatar';

const STYLE = `
:host { display: block; }
:host([hidden]) { display: none; }
.stage { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; align-content: center; gap: 6px 22px; }
.word { display: flex; justify-content: center; }
.letter { position: relative; flex: none; }
.letter > div { width: 100%; height: 100%; pointer-events: none; transition: transform .2s cubic-bezier(.3, 1.5, .5, 1); }
@media (hover: hover) { .letter:hover > div { transform: scale(1.08); } }
:host([glow="on"]) .letter > div, :host(:not([glow])) .letter > div { filter: drop-shadow(0 0 var(--glow-size, 12px) color-mix(in srgb, var(--glow) 65%, transparent)); }
@media (prefers-reduced-motion: reduce) { .letter > div { transition: none; } }
`;

class AlphabetAvatar extends HTMLElement {
  static observedAttributes = ['text', 'spacing', 'flow', 'glow', 'emotion', 'color', 'letters'];

  private stage: HTMLElement;
  private items: Item[] = [];
  private settings: Record<string, LetterSetting> = {};
  private fills = new Fills((key) => this.colorOf(key));
  private observer = new ResizeObserver(() => this.render());
  private drawn = '';

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = STYLE;
    this.stage = document.createElement('div');
    this.stage.className = 'stage';
    this.stage.setAttribute('role', 'img');
    root.append(style, this.stage);
  }
  private colorOf(key: string): Color {
    const all = this.getAttribute('color');
    const fallback = all && /^#[0-9a-f]{6}$/i.test(all) ? all : all && /^\d+$/.test(all) ? Number(all) : null;
    return this.settings[key]?.color ?? fallback ?? defaultColor(key);
  }
  private moodOf(key: string): AvatarMotion {
    return this.settings[key]?.mood ?? ((this.getAttribute('emotion') as AvatarMotion | null) || 'idle');
  }
  connectedCallback() {
    this.observer.observe(this);
    this.fills.speed = FLOW[this.getAttribute('flow') ?? 'normal'] ?? 1;
    this.fills.start();
    this.render();
  }
  disconnectedCallback() {
    this.observer.disconnect();
    this.fills.stop();
    this.clear();
  }
  attributeChangedCallback() {
    if (this.isConnected) this.render();
  }
  private clear() {
    this.items.forEach((item) => item.avatar.destroy());
    this.items = [];
    this.stage.replaceChildren();
    this.drawn = '';
  }
  private render() {
    this.settings = parseLetters(this.getAttribute('letters') ?? '');
    this.fills.speed = FLOW[this.getAttribute('flow') ?? 'normal'] ?? 1;
    const text = this.getAttribute('text') ?? '';
    const words = wordsIn(text);
    this.stage.setAttribute('aria-label', this.getAttribute('label') ?? words.join(' '));
    if (!words.length) {
      this.clear();
      return;
    }
    const spacing = this.getAttribute('spacing') ?? 'normal';
    const { rows, size, f } = layoutWords(words, spacing, this.clientWidth || 600);
    const keyed = keysFor(rows);
    const layout = rows.map((r) => r.join('')).join('|');
    this.fills.refresh();
    if (layout === this.drawn) {
      let n = 0;
      keyed.forEach((row) => row.forEach((key, i) => {
        const item = this.items[n++];
        (item.el as HTMLElement).style.cssText = letterCss(i, row.length, size, f);
        item.holder.style.setProperty('--glow', stopsFor(this.colorOf(key))[1]);
        item.avatar.update({ mood: this.moodOf(key) });
      }));
      return;
    }
    this.clear();
    this.drawn = layout;
    for (const row of keyed) {
      const line = document.createElement('div');
      line.className = 'word';
      row.forEach((key, i) => {
        const el = document.createElement('div');
        el.className = 'letter';
        el.style.cssText = letterCss(i, row.length, size, f);
        const holder = document.createElement('div');
        el.append(holder);
        line.append(el);
        const item = mountLetter(holder, key, this.fills, this.colorOf(key), this.moodOf(key));
        item.el = el;
        growEyesOnHover(el, item, () => this.moodOf(key));
        this.items.push(item);
      });
      this.stage.append(line);
    }
  }
}

// A page may load the script twice; defining the element twice would throw.
if (!customElements.get('alphabet-avatar')) customElements.define('alphabet-avatar', AlphabetAvatar);
