import { describe, expect, it } from 'vitest';
import { mix, parseHex, toOklch, type Rgb } from '../src/color.ts';
import { coatRamp, COAT_RAMP_RANGE, COAT_RAMP_SIZE } from '../src/dom/coat-ramp.ts';

// Sample between texel centers, as the GPU's linear sampler does.
function sample(rgb: Rgb, exposure: number): Rgb {
  const row = coatRamp(rgb);
  const x = Math.max(0, Math.min(COAT_RAMP_SIZE - 1, exposure * COAT_RAMP_SIZE / COAT_RAMP_RANGE - .5));
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

  it('turns equal cube-root exposure steps into equal OKLCH lightness steps through the midtones', () => {
    for (const hex of ['#8b5cf6', '#1fbf68', '#1f7cf2']) {
      const dye = parseHex(hex)!;
      const [root, pile, surface] = [.8 ** 3, .9 ** 3, 1].map(exposure => toOklch(sample(dye, exposure))[0]);
      expect(pile - root).toBeCloseTo(.082, 2);
      expect(surface - pile).toBeCloseTo(.082, 2);
    }
  });

  it('keeps increasing tip lightness above nominal exposure while retaining the dye hue', () => {
    for (const hex of ['#8b5cf6', '#1fbf68', '#1f7cf2']) {
      const dye = parseHex(hex)!;
      const [surfaceL, , hue] = toOklch(sample(dye, 1));
      const [tipL] = toOklch(sample(dye, 1.18));
      const [rimL, , rimHue] = toOklch(sample(dye, 1.5));
      expect(tipL - surfaceL).toBeGreaterThan(.035);
      expect(rimL - tipL).toBeGreaterThan(.025);
      expect(Math.abs(rimHue - hue)).toBeLessThan(2);
    }
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
      const root = sample(dye, .72), tip = sample(dye, 1.18);
      expect(root[0]).toBe(root[2]);
      expect(tip[0]).toBe(tip[1]);
      expect(toOklch(tip)[0] - toOklch(root)[0]).toBeGreaterThan(.075);
    }
  });
});
