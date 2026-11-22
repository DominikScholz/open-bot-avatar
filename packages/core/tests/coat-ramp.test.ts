import { describe, expect, it } from 'vitest';
import { mix, parseHex, toOklch, type Rgb } from '../src/color.ts';
import { coatRamp, COAT_RAMP_RANGE, COAT_RAMP_SIZE } from '../src/dom/coat-ramp.ts';

// Sample between texel centers, as the GPU's linear sampler does.
function sample(rgb: Rgb, lighting: number): Rgb {
  const row = coatRamp(rgb);
  const x = Math.max(0, Math.min(COAT_RAMP_SIZE - 1, lighting * COAT_RAMP_SIZE / COAT_RAMP_RANGE - .5));
  const texel = (i: number): Rgb => [row[4 * i], row[4 * i + 1], row[4 * i + 2]];
  return mix(texel(Math.floor(x)), texel(Math.ceil(x)), x - Math.floor(x));
}

describe('plush dye ramp', () => {
  it('restores the yellow response across the whole lighting range and blends neighboring dyes', () => {
    const weights = (hex: string) => coatRamp(parseHex(hex)!).filter((_, index) => index % 4 === 3);
    for (const hex of ['#ffcf36', '#f8a01c', '#ffff00']) {
      expect(weights(hex).every(weight => weight === 255)).toBe(true);
    }
    for (const hex of ['#8b5cf6', '#1fbf68', '#b0df36', '#ffffff', '#303000']) {
      expect(weights(hex).every(weight => weight === 0)).toBe(true);
    }
    for (const hex of ['#edfd4a', '#fff2b4', '#808000']) {
      expect(weights(hex).every(weight => weight > 0 && weight < 255)).toBe(true);
    }
  });

  it('gives yellow, purple and green the same perceptual range from fiber roots to tips', () => {
    const ranges = ['#ffcf36', '#8b5cf6', '#1fbf68'].map(hex => {
      const dye = parseHex(hex)!;
      const [root, tip] = [.88, 1.04].map(light => toOklch(sample(dye, light))[0]);
      return tip - root;
    });
    expect(Math.min(...ranges)).toBeGreaterThan(.10);
    expect(Math.max(...ranges) - Math.min(...ranges)).toBeLessThan(.01);
  });

  it('keeps recessed fibers in the dye hue and saturated yellow highlights colorful', () => {
    for (const hex of ['#ffcf36', '#8b5cf6', '#1fbf68']) {
      const dye = parseHex(hex)!;
      const [L, C, h] = toOklch(dye);
      const [shadedL, shadedC, shadedHue] = toOklch(sample(dye, .65));
      expect(shadedL).toBeLessThan(L);
      expect(shadedC / shadedL).toBeCloseTo(C / L, 2);
      expect(Math.abs(shadedHue - h)).toBeLessThan(2);
    }
    const [r, g, b] = sample([255, 255, 0], COAT_RAMP_RANGE);
    expect(Math.min(r, g) - b).toBeGreaterThan(180);
  });

  it('retains neutral fur detail at both ends of the color picker', () => {
    for (const v of [0, 128, 255]) {
      const dye: Rgb = [v, v, v];
      const root = sample(dye, .88), tip = sample(dye, 1.06);
      expect(root[0]).toBe(root[2]);
      expect(tip[0]).toBe(tip[1]);
      expect(toOklch(tip)[0] - toOklch(root)[0]).toBeGreaterThan(.075);
    }
  });
});
