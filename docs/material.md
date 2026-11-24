# The soft material

`material: 'soft'` replaces the flat body colour with the *soft-shape* look of the
Hark design study: per-pixel subsurface scattering over the body silhouette,
ported 1:1 from the source fragment shader (`softsprite.ts`), with a cross-section
colour ramp (`material.ts`) as the vector fallback.

```ts
import { mountAvatar } from 'open-bot-avatar/dom';
import { harkBot } from 'open-bot-avatar';

const bot = harkBot('ghost')!;
mountAvatar(el, {
  definition: bot.definition,
  color: bot.color,
  material: 'soft',
  soft: bot.soft,
  followPointer: true,
});
```

## How it reads

- The lit edge keeps the body colour; light travelling into the body is absorbed
  per channel by `density × (1 − linear(color))` (Beer–Lambert, the source
  shader's term), so the core sinks into a richer, saturated version of the same
  hue — never toward gray. Warm hues turn slightly amber in the depth, as in the
  shader.
- Pale bodies absorb little and stay airy. Give them a denser material
  (`density: 5, ambient: 0.12`) to sculpt the volume — the Hark cloud does this.
- Near-black bodies cannot brighten by absorption alone. `lift` screens a floor
  colour over the result (the *night-floor* trick Hark uses on its night sky):
  `soft: { lift: 0.55, liftColor: '#5B698D' }` keeps an ink bot readable.

## How it renders

- **Canvas (live).** `softsprite.ts` reproduces the shader per pixel: a signed
  distance field of the outline (scanline mask + exact Euclidean distance
  transform, analytically refined at the edge), 16 dithered key-light taps
  marching the field, cloud-modulated penetration, the same 2.2 gamma. The
  result is one cached sprite per (outline, colour, material) — ~60 ms once per
  bot, then frames only `drawImage`. The frame's 2D motion (hop, roll, squash)
  applies to the sprite; the live eyes, ribbons and marks paint over it, so
  every state and mood keeps working. The body faces front in this mode: gaze
  still turns the eyes, the 3D body turn is replaced by the shader's volume.
- **SVG still / custom vector renderers.** `AvatarFrame.ramp` (hex stops,
  surface first) plus `tone` on each slice shape carry the same physics per
  cross-section; `renderAvatarSvg` writes a `fill` per slice.
- **CSS 3D scene.** `material: 'soft'` mounts the canvas renderer instead —
  per-slice CSS colour cannot reproduce the per-pixel integral.
- `material: 'soft'` needs a hex `color`; CSS colour variables fall back to flat.

States, moods, ribbons, marks, gaze and motion are untouched in every mode: the
material only changes how the body is painted.

## Options

| Option | |
| --- | --- |
| `material` | `'flat'` (default) or `'soft'`. |
| `soft.density` | Absorption strength. Default `2.2`. Higher = deeper, richer core. |
| `soft.ambient` | Share of undirected light, 0..1. Default `0.5`. Higher = flatter, brighter. |
| `soft.spread` | Optical travel across the full depth. Default `2.4`. |
| `soft.softness` | Key-light cone width in degrees. Default `14`. |
| `soft.lift` | Night-floor lift 0..1. Default `0`. |
| `soft.liftColor` | Floor colour for the lift. Default `#5B698D`. |

## API

- `softSprite(d, color, soft?, size?, lightAngle?)` — the per-pixel sprite as
  straight-alpha RGBA (`SoftSprite`), cached. `lightAngle` 270 = key from the top.
- `softRamp(color, soft?, steps?)` — the vector ramp as `Rgb[]`, surface first.
- `rampAt(ramp, t)` / `rampHexAt(hexRamp, t)` — interpolate at a tone.
- `sliceTone(part, slice)` — where a cross-section sits in its volume.
- `AvatarFrame.softBody` — outline + material + matrix for the canvas sprite;
  `AvatarFrame.ramp` + slice `tone` for vector renderers.

## The Hark roster

`HARK_ROSTER` ships eight bots (ghost, cat, cloud, mug, brain, rocket, star,
bunny) with contract-valid definitions, a role, a body colour drawn only from
Hark DS Rev 8 tokens (sky stops per phase of the day plus the three system
accents), per-colour `soft` tuning, and the zenith-to-horizon sky stops of their
phase for the host background. `HARK`, `HARK_SKY`, `harkBot(id)` and
`harkSky(phase)` expose the tokens. Geometry derives from the open-bot-avatar
gallery and examples (MIT).
