# Alphabet Avatar

Letter-shaped blob avatars with flowing gradients and eyes. Type a word to spell it in avatars, then give each letter its own color and emotion.

**[Try it live](https://andersontsan.github.io/alphabet-avatar/)**

This is a fork of [Open Bot Avatar](https://github.com/DominikScholz/open-bot-avatar) by Dominik Scholz, which provides the rendering engine. Both are MIT licensed; see [LICENSE](LICENSE).

## What's different from the original

- **Letters:** [`gallery/`](gallery) holds 26 letter shapes instead of the original bots.
- **Liquid gradient:** a swirling WebGL fill, with a simpler fallback where WebGL isn't available.
- **Embed script:** an `<alphabet-avatar>` element for putting a live word on any site.
- **Site:** a letter editor replaces the original's editor, docs, and Generate and Import tabs.
- **Engine changes in [`packages/core`](packages/core):**
  - a `paint` option on `mountAvatar`, for filling a body with a gradient or pattern
  - an `angry` mood
  - an `eyeBoost` option for enlarging the eyes
  - `paintFrame` and `framePlacement` for still exports
  - happy letters that jump now and then, rather than constantly

## Run it

Needs Node 22.18 or newer and pnpm.

```sh
pnpm install
pnpm dev          # the site
pnpm check        # type checks, tests and a build
```

## Embed it

The editor's **Copy embed code** button writes this for you:

```html
<script src="https://andersontsan.github.io/alphabet-avatar/alphabet-avatar-v1.js"></script>
<alphabet-avatar text="hello" spacing="tight" letters="H:angry, L2:happy:3"></alphabet-avatar>
```

| Attribute | Values |
|---|---|
| `text` | The word or words to show, A to Z |
| `spacing` | `overlap`, `tight`, `normal`, `wide` |
| `flow` | `still`, `slow`, `normal`, `fast` |
| `glow` | `on`, `off` |
| `emotion` | `idle`, `thinking`, `happy`, `angry`, for every letter |
| `color` | A palette number 0 to 8, or `#rrggbb`, for every letter |
| `letters` | Per-letter settings: `L2:happy:3` is the second L, happy, in palette 3 |
| `label` | Text for screen readers; defaults to the word |

The script respects each visitor's reduced-motion setting.

## Layout

```
apps/site/        the letter editor
gallery/          the 26 letter definitions
packages/core/    the rendering engine, modified from the original
scripts/          make-letters.mjs regenerates gallery/
docs/             the definition format
```

To change a letter's shape, edit it in `scripts/make-letters.mjs`, then run `node scripts/make-letters.mjs`.
