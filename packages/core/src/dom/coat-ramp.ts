import { mix, oklch, toOklch, type Rgb } from '../color.ts';

export const COAT_RAMP_SIZE = 96;
export const COAT_RAMP_RANGE = 1.2;

const ramps = new Map<number, Uint8Array<ArrayBuffer>>();

/** Keep regular lightness steps through the midtones, rolling off near black and white. */
function shoulder(distance: number, room: number): number {
  const knee = room / 2;
  return distance <= knee ? distance : room - knee * Math.exp((knee - distance) / knee);
}

function smoothstep(low: number, high: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}

/** RGB holds the balanced dye ramp. Alpha selects the original yellow fiber response. */
export function coatRamp(rgb: Rgb): Uint8Array<ArrayBuffer> {
  const key = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
  const cached = ramps.get(key);
  if (cached) return cached;
  const [lightness, chroma, hue] = toOklch(rgb);
  // Amber through lemon retain their separate diffuse and glint colors.
  // Fade into the shared ramp for neighboring hues, pale creams and dark olives.
  const yellow = (1 - smoothstep(22, 32, Math.abs(hue - 90)))
    * smoothstep(.025, .085, chroma) * smoothstep(.54, .75, lightness);
  const yellowWeight = Math.round(255 * yellow);
  // Bound the brightest tip by the dye. Where a channel is already full,
  // lift the other dyed channels more than the weakest one.
  const value = Math.max(...rgb);
  const dye = rgb.map(channel => value ? channel / value : 1);
  const weakest = Math.min(...dye);
  const peak = dye.map(channel => 255 * (channel + (1 - channel) * (.16 + .84 * (channel - weakest)))) as Rgb;
  const [peakLightness] = toOklch(peak);
  // Even black, white and fully saturated primaries need some headroom.
  const mid = Math.max(.16, Math.min(lightness, peakLightness - .025));
  const midChroma = chroma * Math.min(1, mid / Math.max(.001, lightness));
  const midColor = oklch(mid, midChroma, hue);
  const headroom = peakLightness - mid;
  const row = new Uint8Array(COAT_RAMP_SIZE * 4);
  for (let i = 0; i < COAT_RAMP_SIZE; i++) {
    const lighting = (i + .5) * COAT_RAMP_RANGE / COAT_RAMP_SIZE;
    const delta = .66 * (lighting - 1);
    const L = mid - shoulder(Math.max(0, -delta), mid);
    const [r, g, b] = delta <= 0
      ? oklch(L, midChroma * L / mid, hue)
      : mix(midColor, peak, shoulder(delta, headroom) / headroom);
    row.set([Math.round(r), Math.round(g), Math.round(b), yellowWeight], i * 4);
  }
  if (ramps.size >= 64) ramps.delete(ramps.keys().next().value!);
  ramps.set(key, row);
  return row;
}
