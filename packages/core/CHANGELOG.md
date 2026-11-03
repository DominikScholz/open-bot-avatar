# open-bot-avatar

## 0.1.2

### Patch Changes

- 052714b: Live avatars cost far less CPU and GPU. Hops and squashes no longer re-rasterize every cross-section, slices hidden behind the body or closer than a pixel apart are not drawn, and avatars under 128 px redraw at 30 fps. `sceneFrame` returns a `slices` visibility list and takes `size`, and a `subscribeFrames` subscriber may return a number of seconds to skip.

## 0.1.1

### Patch Changes

- ccb30d2: First release from GitHub Actions, with provenance.
