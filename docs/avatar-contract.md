# Avatar definition contract — v1

An avatar definition contains geometry only. The runtime controls color, inferred volume, view, gaze, blinking and animation. Definitions do not contain raster images. Use recognizable, soft, minimal object silhouettes with two eyes that remain readable at sidebar size.

```json
{
  "version": 1,
  "id": "controller",
  "name": "Controller",
  "body": { "path": "M ... Z" },
  "eyes": { "x": 50, "y": 46, "spacing": 15, "scale": 1 }
}
```

- Coordinates use a fixed `0 0 100 100` viewBox.
- `body.path` is one monochrome filled SVG path (several closed subpaths allowed, nonzero fill rule; holes wind opposite to their outline). Keep it roughly within 8..92 so there is room for turning and motion. No embedded SVG markup, scripts, external assets, colors or animation.
- `eyes`: `x`/`y` are the center of the pair, `spacing` is center to center, and `scale` 1 means each neutral eye is about 4 units wide and 11 tall. Validation uses that size; the renderer draws eyes up to 1.45× larger where the body has room (every drawn eye shape keeps 3 units from the outline). Eyes must sit visibly inside the body.
- `id` is a lowercase slug, `name` a short display name. Unknown fields are rejected.
- A hole stays a hole even where another subpath covers most of it, as long as it winds opposite to an outline that contains it.
- Rings: an elliptical outline at least 1.6× wider than tall, with one concentric elliptical hole around the center of another subpath, turns as a thin tilted disc. Its lower half passes in front of the part it encircles and its upper half behind (a ball with a ring: a circle, the ring's ellipse and its hole).
- `body.color` (optional, #rgb or #rrggbb) is the body's own color, used when the renderer is given no `color`.
- `body.accents` (optional) marks outlines painted apart from the body color: one to three groups, each `{ "parts": [...], "color": "#rrggbb" }`. `parts` are subpath indexes, counting every subpath of `body.path` from 0 (holes included); only filled outlines can be listed, each at most once. `color` is optional: the renderer's `accentColors` option wins over it, and without either the groups are red, warm white and gold. A plain list of indexes (`[[3], [4, 5]]`) is accepted too and normalized to groups without a color. Without `accents` a definition renders in one color exactly as before.

  ```json
  "body": { "path": "M… Z", "accents": [{ "parts": [3], "color": "#d93025" }, { "parts": [4, 5], "color": "#f4f1ea" }] }
  ```

- An accent outline that lies on another part (at least 80% of its outline inside it) sits on that part's front instead of inside it, so it shows and turns with the face (glasses, a badge). Accent outlines that touch it, or share a color group with a part of the piece, ride along. A loose accent piece that rests on nothing floats at the depth of the piece that does (the year floating above party glasses). In the fluffy finish, accents thinner than 8 units grow a shorter pile, so stems and the strokes of numbers stay thin; in the glass finish, accents thinner than 6 units skip the smoothing and widen a little, so they don't blur away. A hole wound opposite inside such an outline is a lens: it cuts that outline only, even where the face under it covers it.

Before rendering imported definitions, call `validateAvatar`. It returns `{ ok: true, value }` with the normalized definition or `{ ok: false, errors }` with validation errors.

## Strict targets for generated avatars

`validate.sh --strict` (and the gallery check in CI) also requires:

- Face room: the face-bearing part is the dominant mass, and the enlarged eyes keep 4.5 units of clearance at rest and at full gaze travel.
- No silhouette seams: no small sudden steps (0.3–2.5 units) in the outer outline where parts meet. Each join should be a clear step or a smooth, flush continuation.

Valid v1 definitions that do not meet these targets still import and render. The renderer reduces eye enlargement or gaze travel when space is limited.

## The design prompt

The canonical, model-neutral design prompt is [skills/generate-avatar/references/system-prompt.md](../skills/generate-avatar/references/system-prompt.md): schema, geometry rules, face-first proportions and reference examples (kept equal to the engine's examples by tests). The editor includes it in copied generation and repair prompts. Agent-app links reference the hosted prompt. The optional `generate-avatar` skill adds a local validation loop.
