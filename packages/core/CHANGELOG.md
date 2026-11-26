# open-bot-avatar

## 0.5.2

### Patch Changes

- 1e692e6: Fluffy draws in about half the time. Triangles that face away are culled, the outermost shell of pile is left out where it draws nothing, and the shells follow the plain triangles around the eyes. An avatar drawn small also uses a mesh of fewer triangles and a shorter brush, which builds faster and holds less memory. Every strand stays where it was; at small sizes the surface under the strands differs by a shade in a few pixels. No API changes.
- 2786462: Reduce flat frame assembly and ribbon sampling work. Build fluffy meshes with fewer distance calculations and pack hair roots in draw order. Speed up glass texture baking without changing the rendered output. Skip unchanged avatar mounts in the shared frame loop and reuse prepared geometry across live frames.
- 2786462: Reduce live avatar CPU and GPU usage by delegating 2D root motion to CSS transforms when no overlays are active, retaining canvas bitmaps across sub-pixel view changes, capping live frame rates (60 fps max, 30 fps in calm idle states), pausing the animation loop while the document is hidden, culling sub-pixel projected z-slices, avoiding per-frame ribbon `Path2D` parsing, and tightening WebGL2 `fluffy`/`glass` overhead.

## 0.5.1

### Patch Changes

- 5efe3f1: README: the materials are listed with the import each one needs, and the custom state example is shorter to read and shows a mark that moves. No code changes.

## 0.5.0

### Minor Changes

- 5da67c3: `Pose` lists its marks as values. `Pose.marks` replaces `Pose.bang` and `Pose.dots`: each entry is a mark and how far the body has given way to it, so a mark is no longer a field of the pose. Code that builds a whole `Pose` by hand, or reads `bang` or `dots` from one, needs the new field; the `AvatarMark`, `MarkContext`, `MarkPart` and `PoseMark` types are exported for it.
  
  Nothing else changes: `state`, `mood` and every render function take what they took, and every state draws exactly as before. Stills and scenes are the same text; a frame's data is the same apart from what the next entry adds.
- c03a769: Add an opt-in glass material and separate material entry points so DOM consumers do not ship unused renderers.
  
  Migration: import `fluffy` from `open-bot-avatar/materials/fluffy` and pass `material: fluffy` instead of the old `material: "fluffy"` string. Import `glass` from `open-bot-avatar/materials/glass` the same way. The old string draws flat and logs one warning that names the import. Flat remains the default, and the Studio keeps its existing serialized material names and links.
  
  The `AvatarMaterial` type moves from `open-bot-avatar` to `open-bot-avatar/dom`, so the root entry has no DOM types in it. `CanvasMaterial`, the interface a material implements, is experimental: it is given the renderer's own model of the body, and may change in a minor release.
- 5da67c3: `state` takes a definition of your own as well as one of the six names.
  
  A definition is an `id` and a `pose` function that returns what differs from the resting pose: a lean, a look of the eyes, ribbons, or a mark the body gives way to. It works wherever a state does (`mountAvatar`, `update`, the render functions, `createAnimator`), eases to and from the built-in states, and takes a mood. Two definitions with one `id` are the same state. `stateDefinition` returns the definition behind a name, and the `AvatarStateDefinition` and `StateContext` types are exported.
  
  States and marks of your own are experimental: they are written against the renderer's own model of a pose (`Pose`, `StateContext`, `MarkPart`), whose fields may still be renamed or removed in a minor release. The six names are stable.
  
  A material draws a mark of your own too, each part in the shape of its outline: fur in fluffy, glass in glass. A part can set `round` to say it is a circle or an upright capsule, which a material draws from a ready ball as it does the built-in marks. A frame's `paths` carry the flag for the parts of marks. For this a material is one `render` function that draws the body and every part of a mark; `paintMark`, which the materials had before they were released, is gone.
  
  The six names draw exactly as before, with one fix: when a change from one mark to another is interrupted (blocked on its way from thinking, then left), the marks could each weigh too little to show while the body had already gone. The body now stays, small, until a mark shows. `isState` and `resolveLook` still read names only.

## 0.4.0

### Minor Changes

- ef1ecfc: `mountAvatar` takes a `material`: `"fluffy"` gives the body a coat of fur with the eyes set into it, and makes the thinking dots and the blocked exclamation mark fluffy too. `"flat"`, the default, is the solid fill. Fluffy draws with WebGL2 on the canvas renderer and falls back to flat without it.

## 0.3.1

### Patch Changes

- 46b5c52: An avatar's first render is about four times faster. The one-time volume build behind it (cross-sections, part depths, eye placement) took 26 to 72 ms per avatar in Chrome and now takes 4 to 12 ms once the page has built a few; a page that shows many avatars at once is unblocked that much sooner. Stills, frames and scenes come out exactly as before.

## 0.3.0

### Minor Changes

- 54e3688: Six states and a mood of its own.
  
  `state` is what the bot is doing: `idle`, `thinking`, `working`, `waiting`, `blocked` or `done`. `mood` is how it feels: `neutral` or `happy`. A mood shapes the eyes on top of any state, so a bot can be working and happy. `mountAvatar` and `update` take both; the render functions take `state`, `mood` and `stateAge`, and `STATES`, `MOODS`, `isState`, `isMood` and `resolveLook` are exported.
  
  - `thinking` and `blocked` replace the body with a mark: three dots that hop in turn, and an exclamation mark. The body shrinks away as the mark grows in.
  - `working`: every few seconds three to five round-ended ribbons side by side sweep once round the body, in front of it along the top and behind it along the bottom, each a gradient in shades of the body's own color: lighter and warmer, or darker and cooler (grays on a white, gray or black body). `done` celebrates: a few turns inside a cage of nine ribbons on three crossing hoops, a rest, and after a while again. Hosts that animate pass `stateAge`; `createAnimator` returns it.
  - `waiting` flattens the eyes to slits.
  - Eyes morph from one shape to the next instead of swapping inside a blink. The plain pill and the happy arc are drawn as before; every other look is a filled outline.
  - Under reduced motion the ribbons are left out, the marks hold still and `done` does not turn.
  
  What still works: `mood: "idle"`, `mood: "thinking"` and `mood: "happy"` in `mountAvatar`, and `motion` in the render functions. `idle` and `happy` draw exactly as before.
  
  What changed for existing code:
  
  - `thinking` now shows the three dots instead of the body looking up.
  - Custom renderers: `EyeMark` gained `{ shape: "path", d }`, `FrameShape` gained `{ kind: "ribbon", front, fill, gradient }`, and `SceneFrame` gained `body`, `back`, `front` and a `d` per eye. The scene's markup has two overlays (`data-fx`) and a morphing outline per eye (`data-morph`).
  - `Pose` replaces `eyeShape` with `eyes` (`arc`, `slit`) and adds `ribbons`, `cage`, `sweep`, `bang` and `dots`. `MoodState` and the object form of `AvatarMotionBlend["from"]` take `state`, `mood` and `age`; `motion` there is deprecated.
  - `AnimatorInput` takes `state` and `mood`, and `AnimatorStep` returns `stateAge`.

## 0.2.1

### Patch Changes

- 684dddf: Smoother edges on large avatars. Curves are flattened to within 0.02 units, cross-sections follow the real outline instead of the sampling grid, and slice outlines are drawn with curves where they bend gently, so rims no longer show facets or stair steps. Build and render time are unchanged, and the generated SVG and scene markup are slightly smaller than before.

## 0.2.0

### Minor Changes

- 810fbcf: Live avatars paint to one canvas by default instead of a CSS 3D scene: one compositor layer and a small bitmap per avatar rather than a layer per visible slice, so pages with many avatars use far less CPU, memory and DOM and keep a steady frame rate. The bitmap covers what is actually painted. Pass `renderer: "scene"` to `mountAvatar` for the previous scene, which uses less video memory for a single avatar several hundred pixels wide; it is also the fallback without canvas support. `color` and `eyeColor` now accept any CSS color, and `avatarFrame` paths gain a `box`.

### Patch Changes

- 8dd0635: Live avatars outside the viewport stop animating until they scroll back into view. A change made while offscreen is still drawn once.
- 857f487: `validateAvatar` now rejects an empty `body.path` instead of accepting a definition that makes the renderer throw.

## 0.1.2

### Patch Changes

- 052714b: Live avatars cost far less CPU and GPU. Hops and squashes no longer re-rasterize every cross-section, slices hidden behind the body or closer than a pixel apart are not drawn, and avatars under 128 px redraw at 30 fps. `sceneFrame` returns a `slices` visibility list and takes `size`, and a `subscribeFrames` subscriber may return a number of seconds to skip.

## 0.1.1

### Patch Changes

- ccb30d2: First release from GitHub Actions, with provenance.
