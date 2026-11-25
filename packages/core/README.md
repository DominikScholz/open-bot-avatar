# open-bot-avatar

Open Bot Avatar renders object avatars from an SVG silhouette and eye placement. The renderer adds volume, blinking, gaze and motion.

The `open-bot-avatar` package has no dependencies. Its main entry point works without a DOM; `open-bot-avatar/dom` adds browser mounting and pointer tracking.

## Install

```sh
pnpm add open-bot-avatar
```

## Mount an avatar

Create an empty element with an explicit size, such as a 96 × 96 pixel div with `id="bot"`. `mountAvatar` fills that element.

```ts
import { getExample } from "open-bot-avatar";
import { mountAvatar } from "open-bot-avatar/dom";

const avatar = mountAvatar(document.querySelector("#bot")!, {
  definition: getExample("mug")!,
  color: "#ff6a1a",
  followPointer: true,
});

avatar.update({ state: "working", mood: "happy" });
// When the avatar is no longer needed:
avatar.destroy();
```

`update` accepts any subset of the mount options. Omitted options keep their values. Call `destroy` when the avatar is no longer needed; it stops tracking and animation and removes the avatar's content.

| Option | Behavior |
| --- | --- |
| `definition` | Required avatar definition. Validate imported data first. |
| `color`, `eyeColor` | Body and eye colors as `#rgb` or `#rrggbb`, or any CSS color such as `var(--brand)`. Defaults: `#ff6a1a`, `#151515`. |
| `state` | What the bot is doing: `"idle"` (default), `"thinking"`, `"working"`, `"waiting"`, `"blocked"` or `"done"`, or a [state of your own](#custom-states). Changes ease from the current pose. |
| `mood` | How the bot feels: `"neutral"` (default) or `"happy"`. It shapes the eyes on top of any state, and the eyes morph from one shape to the next. `"idle"` and `"thinking"` are still accepted here and mean those states. |
| `followPointer` | Follow the mouse, pen or finger on the page. Default: `false`. |
| `lookAt` | Fixed `{ x, y }` direction, each from -1 to 1 (x right, y down). Overrides the pointer; `null` clears it. |
| `holdGaze` | Keep the current look direction. Default: `false`. |
| `view` | Extra `{ yaw, pitch }` rotation in radians, relative to the resting view. |
| `depth` | Volume amount from 0 to 14. Default: 6; 0 is flat. |
| `reducedMotion` | `true`, `false` or `"system"` (default), which follows `prefers-reduced-motion`. |
| `material` | The body's finish: `"flat"` (default), or an imported material: `fluffy`, a coat of fur with the eyes set into it, or `glass`. See [Materials](#materials). |
| `still` | Render one fixed pose without animation: a static SVG, or for a material one painted canvas. Default: `false`. |
| `renderer` | `"canvas"` (default) paints each frame to one canvas. `"scene"` mounts a CSS 3D scene with one compositor layer per visible cross-section: more CPU, but less video memory for one avatar several hundred pixels wide. Without canvas support, live avatars use the scene. |
| `label` | Accessible name. Defaults to the definition's name; `""` marks it decorative. |

### States and moods

The six states are the ones an agent moves through. Each is motion on the same avatar, not a separate asset:

| State | What it shows |
| --- | --- |
| `idle` | Calm: breathes, sways, blinks and looks around. A happy bot hops. |
| `thinking` | The body gives way to three dots that hop in turn. |
| `working` | Bent over the work with a quick bob and darting eyes. Every few seconds three to five round-ended ribbons sweep once round the body side by side, in front of it along the top and behind it along the bottom, and the eyes follow them. |
| `waiting` | Leans to one side with its eyes flattened to slits, glancing off, and sighs now and then. |
| `blocked` | The body gives way to an exclamation mark that jumps and shakes every few seconds. |
| `done` | Celebrates: a few turns inside a cage of nine ribbons on three crossing hoops, then a rest, and after a while again. |

A mood combines with any state: a bot can be working and happy. A happy bot keeps its arcs while it waits. The marks of `thinking` and `blocked` have no eyes, so a mood shows again when the body returns. Under reduced motion the ribbons are left out, the marks hold still and `done` does not turn.

### Custom states

The six names are one vocabulary. If your bot has a status they don't cover, pass a definition instead of a name. A definition is an `id` and a `pose` function that returns what differs from the resting pose:

> **Experimental.** States and marks of your own are written against the renderer's own model of a pose (`Pose`, `StateContext`, `MarkPart`). Fields of these may be renamed or removed in a minor release while the API settles. The six names are stable.

```ts
import type { AvatarMark, AvatarStateDefinition } from "open-bot-avatar";

// A mark is an id and the outlines it is made of, placed from the mark's center.
// This one is a question mark: a hook over a dot, sized in `unit`.
const question: AvatarMark = {
  id: "question",
  parts: ({ unit: u }) => {
    const arc = (r: number, large: 0 | 1, sweep: 0 | 1, x: number, y: number) => `A${r * u} ${r * u} 0 ${large} ${sweep} ${x * u} ${y * u}`;
    const hook =
      `M${-0.26 * u} ${-0.062 * u}` + arc(0.26, 1, 1, 0.13, 0.163) + arc(0.08, 0, 0, 0.09, 0.232) + arc(0.09, 0, 1, -0.09, 0.232) +
      arc(0.26, 0, 1, 0.04, 0.007) + arc(0.08, 1, 0, -0.08, -0.062) + arc(0.09, 0, 1, -0.26, -0.062) + "Z";
    const w = 0.52 * u, h = 0.645 * u, r = 0.115 * u, gap = 0.1 * u;
    const top = -(h + gap + 2 * r) / 2;
    return [
      { shape: "question-hook", d: hook, box: { x: -w / 2, y: -h / 2, w, h }, x: 0, y: top + h / 2, turn: 0, scale: 1 },
      { shape: "question-dot", d: `M${r} 0A${r} ${r} 0 1 1 ${-r} 0A${r} ${r} 0 1 1 ${r} 0Z`, box: { x: -r, y: -r, w: 2 * r, h: 2 * r }, x: 0, y: -top - r, turn: 0, scale: 1 },
    ];
  },
};

// The body gives way to the mark: the bot needs an answer.
const asking: AvatarStateDefinition = {
  id: "asking",
  pose: () => ({ marks: [{ mark: question, weight: 1 }] }),
};

// The body stays: calm as in idle, leaning, with narrowed eyes.
const listening: AvatarStateDefinition = {
  id: "listening",
  pose: (ctx) => ({ ...ctx.rest(), roll: 6 + ctx.wave(4), squintL: 0.3, squintR: 0.3 }),
};

avatar.update({ state: asking });
```

A definition works wherever a state does: `mountAvatar`, `update`, the render functions and `createAnimator`. Changes to and from it ease like any other, and a mood shapes its eyes.

- `id` names the state. Two definitions with the same `id` are the same state, so you can build a definition inline on every render without restarting it. The six names are taken: a definition with the `id` of one replaces it without easing.
- `pose` receives a context with the clock (`t`, `wave`), the state's age (`stateAge`), the mood, `reducedMotion`, the resting pose (`base`) and the calm idle pose (`rest`). It must be a pure function of the context. Under `reducedMotion`, `t` is 0 and `wave` returns 0; a pose that uses neither holds still.
- `startAge` is the age in seconds a state has when an avatar mounts in it. The default is 0.
- A mark's `parts` are sized in `unit`, a share of the body's smaller side. Keep each outline the same from frame to frame, and animate a part with `x`, `y`, `turn` and `scale`: a live renderer keeps what it builds per outline.
- A [material](#materials) draws every part in the shape of its outline: fur in `fluffy`, glass in `glass`. A part that is a circle or an upright capsule filling `box` can set `round: true` to be drawn from a ready ball, which is cheaper the first time.
- Your code is held to what can be drawn. A pose field that is left out or is not a finite number keeps the resting pose's. A part without a `shape`, an outline `d` or a `box` with a size is left out, and a part's `x`, `y`, `turn` or `scale` that is not a finite number counts as 0, 0, 0 and 1. A `pose` or `parts` function that throws is not caught.
- `stateDefinition("blocked")` returns the definition behind a name, to build a variant on.
- `isState` and `resolveLook` read names only. Use them for values from links and storage; they never return a definition.

To show the statuses of an agent protocol, map each status to a state in your own code:

```ts
import type { AvatarOptions } from "open-bot-avatar/dom";

// The task states of the Model Context Protocol.
const states: Record<string, AvatarOptions["state"]> = {
  working: "working",
  input_required: asking,
  completed: "done",
  failed: "blocked",
  cancelled: "idle",
};
```

### Materials

Mounting ships the flat renderer only. A material is a value you import, so a bundler leaves out the ones you don't use:

```ts
import { mountAvatar } from "open-bot-avatar/dom";
import { glass } from "open-bot-avatar/materials/glass";

const avatar = mountAvatar(element, { definition, material: glass });
avatar.update({ material: "flat" });
```

- `fluffy`, from `open-bot-avatar/materials/fluffy`, is a coat of fur with the eyes set into it.
- `glass`, from `open-bot-avatar/materials/glass`, is tinted glass with reflections and refraction inside the body. It does not refract the page behind the avatar.
- Both need the canvas renderer and WebGL2, and draw flat without them. `renderer: "scene"` always draws flat. Importing a material does not create a WebGL context; its first draw does.
- A material is a value, not a name. `material: "fluffy"`, as it was written before, draws flat and logs one warning that names the import. Keep names in storage and links, and map them to the imported values where you render.
- The `AvatarMaterial` type is exported by `open-bot-avatar/dom`. Writing a material of your own (the `CanvasMaterial` type) is experimental and may change in a minor release.

## React

There is no separate React package. Copy this component to mount on setup, update after rendering, and destroy on cleanup. In other frameworks, use the equivalent lifecycle hooks.

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

// Pass a validated definition as the definition prop.
```

## Static SVG and frames

`renderAvatarSvg` returns a standalone SVG string. `avatarFrame` returns paths, transforms and eye shapes in back-to-front drawing order for custom renderers. Neither needs a DOM.

```ts
import { avatarFrame, renderAvatarSvg, validateAvatar } from "open-bot-avatar";

// text is a JSON string. JSON.parse throws if its syntax is invalid.
const result = validateAvatar(JSON.parse(text));
if (!result.ok) throw new Error(result.errors.join("\n"));

const options = { color: "#1fbf68", time: 1.2, state: "working" as const, mood: "happy" as const };
const svg = renderAvatarSvg(result.value, { ...options, size: 256 });
const frame = avatarFrame(result.value, options);
```

Both functions accept `RenderOptions`:

- `color`, `eyeColor`, `depth` and `view` work as in the mount API.
- `state` and `mood` select what is shown (defaults: `"idle"`, `"neutral"`); `time` sets the animation clock in seconds (default: 0). `motion` (`"idle"`, `"thinking"` or `"happy"`) is the single option that came before them and still works.
- `stateAge` is the time in seconds since `state` began. `done` celebrates from the moment it begins, so a host that animates passes it (`createAnimator` returns it); without it the state is drawn at rest.
- `gaze` sets a fixed direction: `{ x, y, weight? }`. Each axis ranges from -1 to 1; `weight` ranges from 0 to 1 and defaults to 1.
- `size` sets the SVG width and height in pixels. Omit it for a fluid SVG.
- `reducedMotion` is a boolean, defaulting to `false`. It freezes body motion, blinking and marks and leaves out ribbons; gaze still applies. It does not read system preferences.
- `motionBlend` lets a custom animation host blend from what was shown before: `{ from, t }`, with `t` from 0 to 1. `from` is `{ state, mood, age?, blend? }`, where `age` is that state's `stateAge` when the change began and `blend` an interrupted transition.

A frame from `avatarFrame` lists three kinds of shapes. Slices are filled in the body color; the marks of `thinking` and `blocked` are slices too. Eyes are a pill, the happy arc, or a filled `path` for every other look (a waiting bot's slits, and the shapes on the way from one look to the next). Ribbon pieces are filled with a linear `gradient` along their ribbon (`fill` is its middle colour): each ribbon is a shade of the body's own color, a step lighter or darker and turned a little warmer or cooler with it, and runs further from the body's lightness towards its head; on a white, gray or black body the ribbons are grays. `front` says whether the piece is drawn in front of the body. The ribbons ride hoops centred on the body that stand just outside its outline, so they pass behind it only off its edge.

## Definitions and validation

A definition contains one filled SVG path in a `0 0 100 100` viewBox and an eye pair. The path can have multiple closed subpaths; holes wind opposite to their outline. Color and animation are renderer options.

```json
{
  "version": 1,
  "id": "box",
  "name": "Box",
  "body": { "path": "M20 20 H80 V80 H20 Z" },
  "eyes": { "x": 50, "y": 46, "spacing": 15, "scale": 1 }
}
```

`x` and `y` locate the center of the eye pair. `spacing` is the center-to-center distance; `scale` adjusts eye size. Use a lowercase slug for `id` and a short display name for `name`. Unknown fields are rejected.

Parse JSON text first, then call `validateAvatar` before rendering imported definitions. It returns `{ ok: true, value }` with a normalized definition or `{ ok: false, errors }` with validation errors. Invalid JSON syntax throws in `JSON.parse`, before validation.

## Make an avatar

In the [editor](https://dominikscholz.github.io/open-bot-avatar/), describe an avatar in Generate. Copy the prompt into a chat model or open it in an agent app. The editor does not run a model. Paste the returned JSON into Import or drop a JSON file. Import validates it before adding it. If validation fails, use the repair prompt to request a correction.

See the [documentation](https://dominikscholz.github.io/open-bot-avatar/#/docs) and [definition contract](https://github.com/dominikscholz/open-bot-avatar/blob/main/docs/avatar-contract.md).

## Other exports

- `examples` and `getExample(id)` provide built-in definitions.
- `renderAvatarScene` and `sceneFrame` provide CSS 3D scene markup and per-frame transforms, at one compositor layer per visible slice; `mountAvatar` uses them with `renderer: "scene"`.
- `computePose`, `createAnimator` and `pointerGaze` support custom animation hosts.

## License

MIT
