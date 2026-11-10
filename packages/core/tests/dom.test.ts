// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountAvatar } from '../src/dom/mount.ts';
import { examples } from '../src/examples.ts';

const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));

describe('mountAvatar', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('falls back to a live scene without canvas support, updates it in place and cleans up', async () => {
    const el = document.createElement('div');
    document.body.append(el);
    const avatar = mountAvatar(el, { definition: examples[0], color: '#1f7cf2' });
    await frame();
    const scene = el.querySelector('[data-avatar-scene]');
    expect(scene).not.toBeNull();
    expect(el.style.color).toBe('rgb(31, 124, 242)');
    expect(el.getAttribute('role')).toBe('img');
    expect(el.getAttribute('aria-label')).toBe(examples[0].name);

    avatar.update({ color: '#ff0000', mood: 'happy' });
    await frame();
    expect(el.querySelector('[data-avatar-scene]')).toBe(scene);

    avatar.update({ definition: examples[1] });
    await frame();
    expect(el.querySelector('[data-avatar-scene]')).not.toBe(scene);

    avatar.destroy();
    expect(el.innerHTML).toBe('');
  });

  it('shows ribbons, marks and morphing eyes in the scene, and still takes the old mood values', async () => {
    const el = document.createElement('div');
    document.body.append(el);
    const avatar = mountAvatar(el, { definition: examples[0], state: 'working', reducedMotion: false });
    await frame();
    const fx = (side: string) => el.querySelector(`[data-fx="${side}"]`) as Element;
    expect(fx('back').children.length + fx('front').children.length).toBeGreaterThan(0);

    avatar.update({ state: 'idle', mood: 'happy' });
    await frame();
    await frame();
    await frame();
    // Part way from the pill to the arc, an eye is its morphing outline.
    const morph = el.querySelector('[data-morph]') as HTMLElement;
    expect(morph.style.display).toBe('block');
    expect(morph.querySelector('path')?.getAttribute('d')).toMatch(/^M/);

    // `mood: 'thinking'` meant the thinking state before `state` existed. Reduced motion switches at once.
    avatar.update({ state: undefined, mood: 'thinking', reducedMotion: true });
    await frame();
    expect(fx('front').querySelectorAll('path').length).toBe(3);
    expect((el.querySelector('[data-view]') as HTMLElement).style.display).toBe('none');
    avatar.destroy();
  });

  it('renders a still as one SVG and can be decorative', async () => {
    const el = document.createElement('div');
    document.body.append(el);
    const avatar = mountAvatar(el, { definition: examples[2], still: true, label: '' });
    await frame();
    expect(el.querySelector('svg > title')?.textContent).toBe(examples[2].name);
    expect(el.querySelector('[data-avatar-scene]')).toBeNull();
    expect(el.getAttribute('aria-hidden')).toBe('true');
    avatar.destroy();
  });

  it('reports an invalid definition once instead of throwing', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const el = document.createElement('div');
    document.body.append(el);
    const avatar = mountAvatar(el, { definition: { ...examples[0], body: { path: 'nope' } } });
    await frame();
    await frame();
    expect(error).toHaveBeenCalledTimes(1);
    avatar.destroy();
    error.mockRestore();
  });
});
