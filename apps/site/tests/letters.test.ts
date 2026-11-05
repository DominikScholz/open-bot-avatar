import { describe, expect, it, vi } from 'vitest';

// letters.ts reads the gallery through Vite and builds a matrix at load; give it what it needs in Node.
vi.stubGlobal('DOMMatrix', class { scale() { return this; } });

const { LETTERS, PALS, advanceOf, defaultColor, formatLetters, keysFor, layoutWords, letterCss, parseLetters, stopsFor, stopsFrom, wordsIn } = await import('../src/letters.ts');

describe('letters', () => {
  it('has the whole alphabet', () => {
    expect(LETTERS.join('')).toBe('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
  });
});

describe('words', () => {
  it('keeps letters and spaces only', () => {
    expect(wordsIn('Hello  w0rld!')).toEqual(['HELLO', 'WRLD']);
    expect(wordsIn('123')).toEqual([]);
  });

  it('numbers repeated letters across the whole text', () => {
    expect(keysFor([['L', 'L'], ['A', 'L']])).toEqual([['L#0', 'L#1'], ['A#0', 'L#2']]);
  });

  it('starts repeats on different palettes', () => {
    expect(defaultColor('L#0')).not.toBe(defaultColor('L#1'));
  });
});

describe('layout', () => {
  it.each([420, 492, 640, 701, 820])('fits "hello" on one row at %ipx', (width) => {
    for (const spacing of ['overlap', 'tight', 'normal', 'wide']) {
      const { rows, size, f } = layoutWords(['HELLO'], spacing, width);
      expect(rows).toHaveLength(1);
      expect(size * (1 + 4 * f)).toBeLessThanOrEqual(width + 1);
    }
  });

  it('breaks a word that cannot fit, instead of overflowing', () => {
    const { rows, size, f } = layoutWords(['ABCDEFGHIJKLMNOPQRSTUVWX'], 'normal', 343);
    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows) expect(size * (1 + (row.length - 1) * f)).toBeLessThanOrEqual(344);
    expect(rows.flat().join('')).toBe('ABCDEFGHIJKLMNOPQRSTUVWX');
  });

  it('puts the leftmost letter on top', () => {
    const z = (i: number) => Number(/z-index:(\d+)/.exec(letterCss(i, 5, 100, advanceOf('overlap')))?.[1]);
    expect(z(0)).toBeGreaterThan(z(1));
    expect(z(3)).toBeGreaterThan(z(4));
  });

  it('only overlaps at the Overlap stop', () => {
    expect(advanceOf('overlap')).toBeLessThan(advanceOf('tight'));
    expect(advanceOf('wide')).toBeGreaterThan(1);
    expect(advanceOf('nonsense')).toBe(advanceOf('normal'));
  });
});

describe('embed settings', () => {
  it('round-trips emotions and colors, including repeated letters', () => {
    const settings = { 'H#0': { mood: 'angry' as const }, 'L#1': { mood: 'happy' as const, color: 3 }, 'O#0': { color: '#ff5fa8' } };
    expect(parseLetters(formatLetters(settings))).toEqual(settings);
  });

  it('writes the second L as L2', () => {
    expect(formatLetters({ 'L#1': { mood: 'happy' } })).toBe('L2:happy');
  });

  it('ignores anything unknown', () => {
    expect(parseLetters('H:furious:99, $$:happy, L:happy:javascript')).toEqual({ 'H#0': {}, 'L#0': { mood: 'happy' } });
    expect(parseLetters('')).toEqual({});
  });
});

describe('colors', () => {
  it('builds a four-color gradient around a picked color', () => {
    const stops = stopsFrom('#22aa77');
    expect(stops).toHaveLength(4);
    expect(stops[1]).toBe('#22aa77');
    for (const stop of stops) expect(stop).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('resolves palettes and picked colors', () => {
    expect(stopsFor(2)).toBe(PALS[2]);
    expect(stopsFor('#112233')[1]).toBe('#112233');
  });
});
