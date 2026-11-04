// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { mountAvatar } from '../src/dom/mount.ts';
import { examples } from '../src/examples.ts';

/** jsdom has no IntersectionObserver: one whose visibility the test sets. */
const observers: { target: Element | null; callback: IntersectionObserverCallback }[] = [];
beforeAll(() => {
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = class {
    entry: { target: Element | null; callback: IntersectionObserverCallback };
    constructor(callback: IntersectionObserverCallback) {
      this.entry = { target: null, callback };
      observers.push(this.entry);
    }
    observe(target: Element) {
      this.entry.target = target;
    }
    disconnect() {
      this.entry.target = null;
    }
  };
});

function setVisible(el: Element, isIntersecting: boolean) {
  for (const o of observers) {
    if (o.target === el) o.callback([{ isIntersecting, target: el } as IntersectionObserverEntry], {} as IntersectionObserver);
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Animation frames the shared loop asks for while `run` waits. */
async function framesDuring(run: () => Promise<unknown>) {
  const spy = vi.spyOn(window, 'requestAnimationFrame');
  await run();
  const n = spy.mock.calls.length;
  spy.mockRestore();
  return n;
}

describe('mountAvatar offscreen', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('stops animating out of view and resumes when it scrolls back', async () => {
    const el = document.createElement('div');
    document.body.append(el);
    const avatar = mountAvatar(el, { definition: examples[0], reducedMotion: false });
    expect(await framesDuring(() => wait(80))).toBeGreaterThan(0);

    setVisible(el, false);
    await wait(50);
    expect(await framesDuring(() => wait(80))).toBe(0);

    setVisible(el, true);
    expect(await framesDuring(() => wait(80))).toBeGreaterThan(0);
    avatar.destroy();
    expect(observers.find((o) => o.target === el)).toBeUndefined();
  });

  it('still applies a change made out of view, then sleeps again', async () => {
    const el = document.createElement('div');
    document.body.append(el);
    const avatar = mountAvatar(el, { definition: examples[0] });
    await wait(50);
    const first = el.querySelector('[data-avatar-scene]');
    setVisible(el, false);
    await wait(50);

    avatar.update({ definition: examples[1] });
    await wait(80);
    const next = el.querySelector('[data-avatar-scene]');
    expect(next).not.toBeNull();
    expect(next).not.toBe(first);
    expect(await framesDuring(() => wait(80))).toBe(0);
    avatar.destroy();
  });

  it('draws its first frame even when mounted out of view', async () => {
    const el = document.createElement('div');
    document.body.append(el);
    const avatar = mountAvatar(el, { definition: examples[2] });
    setVisible(el, false);
    await wait(50);
    expect(el.querySelector('[data-avatar-scene]')).not.toBeNull();
    avatar.destroy();
  });
});
