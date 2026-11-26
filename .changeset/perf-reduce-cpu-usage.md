---
"open-bot-avatar": patch
---

Reduce live avatar CPU and GPU usage by delegating 2D root motion to CSS transforms when no overlays are active, retaining canvas bitmaps across sub-pixel view changes, capping live frame rates (60 fps max, 30 fps in calm idle states), pausing the animation loop while the document is hidden, culling sub-pixel projected z-slices, avoiding per-frame ribbon `Path2D` parsing, and tightening WebGL2 `fluffy`/`glass` overhead.
