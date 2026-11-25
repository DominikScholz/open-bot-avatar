<p><img src="assets/banner.png" width="100%" alt="Open Bot Avatar: colorful object avatars with eyes, a row of flat ones over two rows of fluffy ones, such as a ghost, a controller, a sprout, a cat and a mug"></p>

A JSON spec and renderer for interactive agent avatars.

- Spec: one SVG path and where the eyes sit ([contract](docs/avatar-contract.md)).
- Renderer: the `open-bot-avatar` package, no dependencies.
- [Editor](https://dominikscholz.github.io/open-bot-avatar/): pick, color, generate and import avatars.

Open source, MIT licensed. [Docs](https://dominikscholz.github.io/open-bot-avatar/#/docs).

## Make an avatar

In the [editor](https://dominikscholz.github.io/open-bot-avatar/), describe it under Generate, send the prompt to any chat model or agent, and paste the JSON it returns into Import. The prompt is [system-prompt.md](skills/generate-avatar/references/system-prompt.md); agents with skills can use the [generate-avatar skill](skills/generate-avatar/SKILL.md).

To add one to the gallery, open a pull request with its JSON in [`gallery/`](gallery). [CONTRIBUTING.md](CONTRIBUTING.md) has the rules for pull requests.

## Definition

One SVG path in a `0 0 100 100` box, and the eyes.

```json
{
  "version": 1,
  "id": "box",
  "name": "Box",
  "body": { "path": "M20 20 H80 V80 H20 Z" },
  "eyes": { "x": 50, "y": 46, "spacing": 15, "scale": 1 }
}
```

`x`, `y`: the eyes' center; `spacing`: the distance between them; `scale`: their size. Check definitions you didn't write with `validateAvatar`, which returns `{ ok: true, value }` or `{ ok: false, errors }`. The rules are in the [contract](docs/avatar-contract.md).

## How it renders

The volume is inferred from the outline as stacked cross-sections. Live avatars project them and paint each frame to one canvas; stills are projected into one SVG. A CSS 3D scene with one SVG per cross-section is available as `renderer: "scene"`.

## Install

```sh
pnpm add open-bot-avatar
```

## Mount an avatar

`mountAvatar` fills a square element.

```ts
import { getExample } from "open-bot-avatar";
import { mountAvatar } from "open-bot-avatar/dom";

const avatar = mountAvatar(document.querySelector("#bot")!, {
  definition: getExample("mug")!,
  color: "#ff6a1a",
  followPointer: true,
});

avatar.update({ state: "working", mood: "happy" }); // any subset of the options
avatar.destroy();
```

| Option | |
| --- | --- |
| `definition` | The avatar. Required. |
| `color`, `eyeColor` | `#rgb`, `#rrggbb` or any CSS color. Default: `#ff6a1a`, `#151515`. |
| `state` | What the bot is doing: `"idle"` (default), `"thinking"`, `"working"`, `"waiting"`, `"blocked"` or `"done"`, or a [state of your own](#custom-states). |
| `mood` | How it feels: `"neutral"` (default) or `"happy"`. It shapes the eyes on any state. |
| `followPointer` | Look at the mouse or finger. Default: `false`. |
| `lookAt` | A fixed look direction, `{ x, y }` from -1 to 1. Wins over the pointer. |
| `holdGaze` | Keep looking where it looks now. Default: `false`. |
| `view` | Extra rotation, `{ yaw, pitch }` in radians. |
| `depth` | Volume, 0 (flat) to 14. Default: 6. |
| `reducedMotion` | `true`, `false` or `"system"` (default). |
| `material` | The body's finish: `"flat"` (default), or an imported material, `fluffy` or `glass`. See [Materials](#materials). |
| `still` | One fixed pose, no animation: an SVG, or one painted canvas for an imported material. Default: `false`. |
| `renderer` | `"canvas"` (default) or `"scene"`, a CSS 3D scene: more CPU, less video memory for one large avatar. |
| `label` | Accessible name. Default: the definition's name; `""` for decorative. |

## Materials

A material is the body's finish. There are three. The [docs](https://dominikscholz.github.io/open-bot-avatar/#/docs) show them live.

| Material | Import | Look |
| --- | --- | --- |
| `"flat"` | Built in. Nothing to import. | Solid color. The default. |
| `fluffy` | `import { fluffy } from "open-bot-avatar/materials/fluffy"` | A coat of fur with the eyes set into it. |
| `glass` | `import { glass } from "open-bot-avatar/materials/glass"` | Tinted glass with reflections and refraction inside the body. It does not refract the page behind the avatar. |

Mounting ships the flat renderer only. A material is a value you import and pass as `material`, so a bundler leaves out the ones you don't use:

```ts
import { mountAvatar } from "open-bot-avatar/dom";
import { glass } from "open-bot-avatar/materials/glass";

const avatar = mountAvatar(element, { definition, material: glass });
avatar.update({ material: "flat" });
```

- Fluffy and glass need the canvas renderer and WebGL2, and draw flat without them. `renderer: "scene"` and `renderAvatarSvg` always draw flat.
- A material is a value, not a name. `material: "fluffy"`, as it was written before, draws flat and logs one warning that names the import. Keep names in storage and links, and map them to the imported values where you render.
- Writing a material of your own (the `CanvasMaterial` type) is experimental and may change in a minor release.

More in the [package README](packages/core/README.md#materials).

## Custom states

> **Experimental.** States and marks of your own are written against the renderer's own model of a pose. Its fields may be renamed or removed in a minor release. The six names are stable.

If your bot has a status the six states don't cover, pass a definition instead of a name: an `id` and a `pose` function that returns what differs from the resting pose.

```ts
import type { AvatarStateDefinition } from "open-bot-avatar";

// The body stays: calm as in idle, leaning, with narrowed eyes.
const listening: AvatarStateDefinition = {
  id: "listening",
  pose: (ctx) => ({ ...ctx.rest(), roll: 6 + ctx.wave(4), squintL: 0.3, squintR: 0.3 }),
};

avatar.update({ state: listening });
```

A pose can also name a mark the body gives way to, as `thinking` and `blocked` do. Every material draws a mark in its own shape. The [package README](packages/core/README.md#custom-states) has a question mark as an example, and the details.

## SVG

`renderAvatarSvg` returns an SVG string; `avatarFrame` returns the same frame as data, for drawing it yourself. Neither needs a DOM.

```ts
import { avatarFrame, renderAvatarSvg, validateAvatar } from "open-bot-avatar";

const result = validateAvatar(JSON.parse(json));
if (result.ok) {
  const svg = renderAvatarSvg(result.value, { color: "#1fbf68", size: 256 });
  const frame = avatarFrame(result.value, { color: "#1fbf68" });
}
```

Both also take `time` (seconds), `motion` (the mood) and `gaze`.

## React

There's no React package; copy this component. Other frameworks work the same way.

```tsx
import { useEffect, useRef } from "react";
import { mountAvatar, type AvatarOptions, type MountedAvatar } from "open-bot-avatar/dom";

export function BotAvatar({ size = 96, ...options }: AvatarOptions & { size?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const avatar = useRef<MountedAvatar | null>(null);
  useEffect(() => {
    avatar.current = mountAvatar(host.current!, options);
    return () => avatar.current?.destroy();
  }, []);
  useEffect(() => avatar.current?.update(options));
  return <div ref={host} style={{ width: size, aspectRatio: "1" }} />;
}
```

## Repository layout

```text
packages/core/   npm package: engine and browser mount
apps/site/       editor and documentation (Vite + React)
gallery/         community avatar definitions
skills/          design prompt and generation skill
docs/            definition contract
```

## Development

```sh
pnpm install
pnpm dev          # the site, with the package from source
pnpm test         # Vitest: engine, DOM mount, editor and gallery checks
pnpm typecheck
pnpm build        # the package to dist/, the site to apps/site/dist/
pnpm check        # typecheck, tests and build, in sequence
node packages/core/scripts/avatar-validate.ts --strict my-avatar.json --svg my-avatar.svg
```

Needs Node 22.18+ and pnpm. Before you open a pull request, read [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
