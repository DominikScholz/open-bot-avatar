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
