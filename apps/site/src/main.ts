import type { AvatarMotion } from 'open-bot-avatar';
import { saveFile, wordToPng, wordToSvg, type Word } from './exporter.ts';
import { FLOW, Fills, LETTERS, MOODS, PALS, defaultColor, formatLetters, growEyesOnHover, keyOf, keysFor, layoutWords, letterCss, mountLetter, parts, stopsFor, stopsFrom, wordsIn, type Color, type Item, type LetterSetting } from './letters.ts';
import './style.css';

const state = {
  sel: { k: 'H', occ: 0 },
  text: 'hello',
  scope: 'one' as 'one' | 'all',
  spacing: 'normal',
  flow: 'normal',
  glow: true,
  colors: {} as Record<string, Color>,
  allColor: null as Color | null,
  moods: {} as Record<string, AvatarMotion>,
  allMood: null as AvatarMotion | null,
  randomMoods: false,
};
const selKey = () => keyOf(state.sel.k, state.sel.occ);

const colorOf = (key: string): Color => state.colors[key] ?? state.allColor ?? defaultColor(key);
const pickMood = (avoid: AvatarMotion | null) => {
  const options = MOODS.filter((m) => m !== avoid);
  return options[Math.floor(Math.random() * options.length)];
};
function moodOf(key: string): AvatarMotion {
  if (state.moods[key]) return state.moods[key];
  if (state.randomMoods) return (state.moods[key] = pickMood(null));
  return state.allMood ?? 'idle';
}

const fills = new Fills(colorOf);
fills.start();

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const stage = $('stage');
let stageItems: Item[] = [];
let stageLayout = '';
const gridItems: Item[] = [];

function refreshAll() {
  fills.refresh();
  [...gridItems, ...stageItems].forEach((item) => {
    item.holder.style.setProperty('--glow', stopsFor(colorOf(item.key))[1]);
    item.avatar.update({ mood: moodOf(item.key) });
  });
  markSelection();
}

function renderStage() {
  const words = wordsIn(state.text);
  const typed = words.length > 0;
  if (!typed) state.sel.occ = 0;
  const width = stage.clientWidth || 600;
  const { rows, size, f } = typed ? layoutWords(words, state.spacing, width) : { rows: [[state.sel.k]], size: Math.min(width, 340), f: 1 };
  const layout = rows.map((r) => r.join('')).join('|');
  stage.setAttribute('aria-label', typed ? `Letter avatars spelling ${words.join(' ')}` : `Letter ${state.sel.k} avatar`);
  $('spacingRow').hidden = !typed;
  $('note').textContent = /[^A-Za-z ]/.test(state.text) ? 'Only letters A to Z are shown.' : '';
  if (layout === stageLayout) {
    let n = 0;
    rows.forEach((row) => row.forEach((_, i) => {
      (stageItems[n++].el as HTMLElement).style.cssText = letterCss(i, row.length, size, f);
    }));
    markSelection();
    return;
  }
  stageItems.forEach((a) => a.avatar.destroy());
  stageItems = [];
  stage.replaceChildren();
  stageLayout = layout;
  for (const row of keysFor(rows)) {
    const line = document.createElement('div');
    line.className = 'word';
    row.forEach((key, i) => {
      const { k, occ } = parts(key);
      const b = document.createElement('button');
      b.className = 'letter';
      b.dataset.key = key;
      b.style.cssText = letterCss(i, row.length, size, f);
      b.setAttribute('aria-label', `Edit letter ${k}${occ ? `, number ${occ + 1}` : ''}`);
      b.onclick = () => select(k, occ);
      const holder = document.createElement('div');
      b.append(holder);
      line.append(b);
      const item = mountLetter(holder, key, fills, colorOf(key), moodOf(key));
      item.el = b;
      growEyesOnHover(b, item, () => moodOf(key));
      stageItems.push(item);
    });
    stage.append(line);
  }
  // Forget fills for letters that are no longer on the page; the grid keeps every first instance.
  const live = new Set(stageItems.map((a) => a.key));
  fills.prune((key) => parts(key).occ === 0 || live.has(key));
  markSelection();
}

function markSelection() {
  const typed = state.text.trim().length > 0, key = selKey(), one = state.scope === 'one';
  document.querySelectorAll<HTMLElement>('.tile').forEach((t) => t.setAttribute('aria-pressed', String(one && t.dataset.key === key)));
  document.querySelectorAll<HTMLElement>('.letter').forEach((t) => t.classList.toggle('on', typed && one && t.dataset.key === key));
  const nth = ['', ' (2nd)', ' (3rd)'][state.sel.occ] ?? ` (${state.sel.occ + 1}th)`;
  $('colorTitle').textContent = one ? `Editing ${state.sel.k}${nth}` : 'Editing all letters';
  const shownMood = one ? moodOf(key) : state.randomMoods ? null : (state.allMood ?? 'idle');
  document.querySelectorAll<HTMLElement>('[data-mood]').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.mood === shownMood)));
  $('scopeOne').setAttribute('aria-pressed', String(one));
  $('scopeAll').setAttribute('aria-pressed', String(!one));
  const cur = one ? state.colors[key] : state.allColor;
  const shownColor = cur === undefined || cur === null ? 'default' : typeof cur === 'number' ? String(cur) : 'custom';
  document.querySelectorAll<HTMLElement>('.swatch').forEach((s) => s.setAttribute('aria-pressed', String(s.dataset.p === shownColor)));
}
function select(k: string, occ: number) {
  state.sel = { k, occ };
  state.scope = 'one';
  if (state.text.trim()) markSelection();
  else renderStage();
}
function applyColor(value: Color | null) {
  if (state.scope === 'all') {
    state.colors = {};
    state.allColor = value;
  } else if (value === null) delete state.colors[selKey()];
  else state.colors[selKey()] = value;
  refreshAll();
}

/* ---------- Controls ---------- */
const MOOD_LABELS: Record<AvatarMotion, string> = { idle: 'Idle', thinking: 'Thinking', happy: 'Happy', angry: 'Angry' };
for (const m of MOODS) {
  const b = document.createElement('button');
  b.className = 'chip';
  b.textContent = MOOD_LABELS[m];
  b.dataset.mood = m;
  b.onclick = () => {
    if (state.scope === 'all') {
      state.moods = {};
      state.allMood = m;
      state.randomMoods = false;
    } else state.moods[selKey()] = m;
    refreshAll();
  };
  $('moods').append(b);
}

for (const k of LETTERS) {
  const b = document.createElement('button');
  const key = keyOf(k, 0);
  b.className = 'tile';
  b.dataset.key = key;
  b.setAttribute('aria-label', `Letter ${k}`);
  const el = document.createElement('div');
  b.append(el);
  b.onclick = () => select(k, 0);
  $('grid').append(b);
  const item = mountLetter(el, key, fills, colorOf(key), moodOf(key));
  growEyesOnHover(b, item, () => moodOf(key));
  gridItems.push(item);
}

function addSwatch(p: string, label: string, bg: string, value: Color | null) {
  const b = document.createElement('button');
  b.className = 'swatch';
  b.dataset.p = p;
  b.style.background = bg;
  b.setAttribute('aria-label', label);
  b.title = label;
  b.onclick = () => applyColor(value);
  $('swatches').append(b);
}
addSwatch('default', 'Default color', 'conic-gradient(#FF4F7B, #FFC233, #3EDC6E, #19B8E6, #8F6BFF, #FF4F7B)', null);
PALS.forEach((p, i) => addSwatch(String(i), `Color ${i + 1}`, `linear-gradient(135deg, ${p[0]}, ${p[1]} 55%, ${p[2]})`, i));
const custom = document.createElement('label');
custom.className = 'swatch custom';
custom.dataset.p = 'custom';
custom.title = 'Pick your own color';
custom.style.background = 'var(--bg)';
const picker = document.createElement('input');
picker.type = 'color';
picker.value = '#ff5fa8';
picker.setAttribute('aria-label', 'Pick your own color');
picker.addEventListener('input', () => {
  const s = stopsFrom(picker.value);
  custom.style.background = `linear-gradient(135deg, ${s[0]}, ${s[1]} 55%, ${s[2]})`;
  applyColor(picker.value);
});
custom.append(picker);
$('swatches').append(custom);

$('scopeOne').onclick = () => {
  state.scope = 'one';
  markSelection();
};
$('scopeAll').onclick = () => {
  state.scope = 'all';
  markSelection();
};
const textBox = $<HTMLInputElement>('text');
textBox.addEventListener('input', () => {
  state.text = textBox.value;
  renderStage();
});

function stops(group: string, onPick: (b: HTMLButtonElement) => void) {
  const buttons = document.querySelectorAll<HTMLButtonElement>(`#${group} button`);
  buttons.forEach((b) => {
    b.onclick = () => {
      buttons.forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
      onPick(b);
    };
  });
}
stops('spacingStops', (b) => {
  state.spacing = b.dataset.stop as string;
  renderStage();
});
stops('flowStops', (b) => {
  state.flow = b.dataset.flow as string;
  fills.speed = FLOW[state.flow];
});
stops('glowStops', (b) => {
  state.glow = b.dataset.glow === 'on';
  document.body.classList.toggle('glow', state.glow);
});

$('randomMoods').onclick = () => {
  state.moods = {};
  state.allMood = null;
  state.randomMoods = true;
  // Letters in the word go first, so neighbors in the word never match.
  let last: AvatarMotion | null = null;
  stageItems.forEach((item) => {
    last = pickMood(last);
    state.moods[item.key] = last;
  });
  refreshAll();
};

/* ---------- Export ---------- */
/** The current word or, with nothing typed, the selected letter. */
const shownWords = () => {
  const words = wordsIn(state.text);
  return words.length ? words : [state.sel.k];
};
const currentWord = (): Word => ({ words: shownWords(), spacing: state.spacing, glow: state.glow, colorOf, moodOf, fills });
const fileName = (ext: string) => `${shownWords().join('-').toLowerCase()}.${ext}`;
const tell = (message: string) => {
  $('status').textContent = message;
};

/** The HTML for this word; only what differs from the defaults is written out. */
function embedCode(): string {
  const settings: Record<string, LetterSetting> = {};
  for (const row of keysFor(shownWords().map((w) => w.split('')))) {
    for (const key of row) {
      const mood = moodOf(key), color = colorOf(key);
      const setting: LetterSetting = {};
      if (mood !== 'idle') setting.mood = mood;
      if (color !== defaultColor(key)) setting.color = color;
      if (setting.mood || setting.color !== undefined) settings[key] = setting;
    }
  }
  const attrs = [`text="${shownWords().join(' ').toLowerCase()}"`];
  if (state.spacing !== 'normal') attrs.push(`spacing="${state.spacing}"`);
  if (state.flow !== 'normal') attrs.push(`flow="${state.flow}"`);
  if (!state.glow) attrs.push('glow="off"');
  if (Object.keys(settings).length) attrs.push(`letters="${formatLetters(settings)}"`);
  const script = new URL('alphabet-avatar-v1.js', document.baseURI).href;
  return `<script src="${script}"></script>\n<alphabet-avatar ${attrs.join(' ')}></alphabet-avatar>`;
}
$('copyEmbed').onclick = async () => {
  const code = embedCode();
  const box = $<HTMLTextAreaElement>('embedCode');
  box.value = code;
  box.hidden = false;
  try {
    await navigator.clipboard.writeText(code);
    tell('Embed code copied. Paste it into your site\'s HTML.');
  } catch {
    box.select();
    tell('Couldn\'t reach the clipboard. Copy the code above yourself.');
  }
};
$('savePng').onclick = async () => {
  try {
    saveFile(fileName('png'), await wordToPng(currentWord()));
    tell('PNG saved. Images are still, without the motion.');
  } catch (error) {
    tell(error instanceof Error ? error.message : 'Could not create the PNG.');
  }
};
$('saveSvg').onclick = () => {
  saveFile(fileName('svg'), wordToSvg(currentWord()));
  tell('SVG saved. Its gradients approximate the liquid fill, and it\'s still.');
};

let lastWidth = 0;
new ResizeObserver(() => {
  if (stage.clientWidth !== lastWidth) {
    lastWidth = stage.clientWidth;
    stageLayout = '';
    renderStage();
  }
}).observe(stage);

textBox.value = state.text;
mountLetter($('logo'), keyOf('A', 0), fills, colorOf(keyOf('A', 0)), 'idle');
renderStage();
