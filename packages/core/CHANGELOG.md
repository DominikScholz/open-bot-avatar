# open-bot-avatar

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
