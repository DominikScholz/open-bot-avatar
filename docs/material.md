# The soft material

`material: 'soft'` replaces the flat body colour with a subsurface-scattering ramp
through the implied volume. It is a TypeScript port of the *soft-shape* fragment
shader from the Hark design study, adapted to the cross-section renderer: instead
of tracing light per pixel, each cross-section is coloured by how deep it sits in
its part (`tone`, 0 at the surface to 1 at the deepest slice).

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

- The surface slice keeps the **exact body colour** — the ramp is normalized, so
  `soft` never tints the face of the bot.
- Deeper slices absorb light per channel by `density × (1 − linear(color))`, the
  Beer–Lambert term of the source shader. Saturated bodies sink into a richer,
  glowing version of the same hue; warm hues turn slightly amber in the depth,
  as they do in the shader. Nothing fades toward gray.
- Pale bodies absorb little and stay airy. Give them a denser material
  (`density: 5, ambient: 0.12`) to sculpt the volume — the Hark cloud does this.
- Near-black bodies cannot brighten by absorption alone. `lift` screens a floor
  colour over the result (the *night-floor* trick Hark uses on its night sky):
  `soft: { lift: 0.55, liftColor: '#5B698D' }` keeps an ink bot readable.

All states, moods, ribbons, marks, gaze and motion are untouched: the material
only changes the colour each slice is painted with, in every renderer — the
canvas (`paintCanvas` reads `frame.ramp`), the SVG still (`renderAvatarSvg`
writes a `fill` per slice) and the CSS 3D scene (per-slice `color` baked into the
static markup, keyed by material so a change remounts it).

## Options

| Option | |
| --- | --- |
| `material` | `'flat'` (default) or `'soft'`. Needs a hex `color`; CSS colour variables fall back to flat. |
| `soft.density` | Absorption strength. Default `2.2`. Higher = deeper, richer shadows. |
| `soft.ambient` | Share of undirected light, 0..1. Default `0.5`. Higher = flatter, brighter. |
| `soft.spread` | Optical travel across the full depth. Default `2.4`. |
| `soft.lift` | Night-floor lift 0..1. Default `0`. |
| `soft.liftColor` | Floor colour for the lift. Default `#5B698D`. |

## API

- `softRamp(color, soft?, steps?)` — the ramp as `Rgb[]`, surface first.
- `rampAt(ramp, t)` / `rampHexAt(hexRamp, t)` — interpolate at a tone.
- `sliceTone(part, slice)` — where a cross-section sits in its volume.
- `AvatarFrame.ramp` — hex stops, present only for `soft` + hex colour; slice
  shapes carry `tone` to index it. Custom renderers can use both directly.

## The Hark roster

`HARK_ROSTER` ships eight bots (ghost, cat, cloud, mug, brain, rocket, star,
bunny) with contract-valid definitions, a role, a body colour drawn only from
Hark DS Rev 8 tokens (sky stops per phase of the day plus the three system
accents), per-colour `soft` tuning, and the zenith-to-horizon sky stops of their
phase for the host background. `HARK`, `HARK_SKY`, `harkBot(id)` and
`harkSky(phase)` expose the tokens. Geometry derives from the open-bot-avatar
gallery and examples (MIT).
