// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { requestFrame, subscribeFrames, subscribeMountFrames } from '../src/dom/clock.ts';

it.each(['measure', 'draw'] as const)('skips subscribers removed during %s while processing active ones', phase => {
  let pending: FrameRequestCallback | undefined;
  const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => { pending = cb; return 1; });
  const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => { pending = undefined; });
  const removedMeasure = vi.fn(), removedDraw = vi.fn(() => false);
  const activeMeasure = vi.fn(), activeDraw = vi.fn(() => false);
  let remove: () => void;
  const first = subscribeFrames({
    measure() { if (phase === 'measure') remove(); },
    draw() { if (phase === 'draw') remove(); return false; },
  });
  remove = subscribeFrames({ measure: removedMeasure, draw: removedDraw });
  const active = subscribeFrames({ measure: activeMeasure, draw: activeDraw });
  try {
    pending!(performance.now());
    expect(removedMeasure).toHaveBeenCalledTimes(phase === 'measure' ? 0 : 1);
    expect(removedDraw).not.toHaveBeenCalled();
    expect(activeMeasure).toHaveBeenCalledTimes(1);
    expect(activeDraw).toHaveBeenCalledTimes(1);
  } finally {
    first(); remove(); active(); raf.mockRestore(); cancel.mockRestore();
  }
});

it('runs only the live subscriber until parked mounts are invalidated', () => {
  let pending: FrameRequestCallback | undefined;
  const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => { pending = cb; return 1; });
  const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => { pending = undefined; });
  const start = performance.now();
  const times: number[] = [];
  const tick = (n: number) => {
    const cb = pending!;
    pending = undefined;
    cb(start + n * 16);
  };
  const live = subscribeFrames({ draw(time) { times.push(time); return true; } });
  const measure = vi.fn(), draw = vi.fn(() => false);
  const mounts = Array.from({ length: 100 }, () => subscribeMountFrames({ measure, draw }, () => true));
  const publicDraw = vi.fn(() => false);
  const external = subscribeFrames({ draw: publicDraw });
  try {
    tick(0);
    expect(draw).toHaveBeenCalledTimes(100);
    measure.mockClear(); draw.mockClear();
    for (let n = 1; n <= 10; n++) tick(n);
    expect(draw).not.toHaveBeenCalled();
    expect(measure).not.toHaveBeenCalled();
    expect(publicDraw).toHaveBeenCalledTimes(11);
    expect(times).toHaveLength(11);
    expect(times[10] - times[0]).toBeCloseTo(0.16, 10);

    mounts[0].request();
    tick(11);
    expect(draw).toHaveBeenCalledTimes(1);
    mounts[0].unsubscribe();
    requestFrame();
    tick(12);
    expect(draw).toHaveBeenCalledTimes(100); // targeted wake, then all 99 remaining mounts
  } finally {
    for (const m of mounts) m.unsubscribe();
    external(); live(); raf.mockRestore(); cancel.mockRestore();
  }
});
