# open-bot-avatar

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
