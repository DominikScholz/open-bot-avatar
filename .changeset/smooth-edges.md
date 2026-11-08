---
"open-bot-avatar": patch
---

Smoother edges on large avatars. Curves are flattened to within 0.02 units, cross-sections follow the real outline instead of the sampling grid, and slice outlines are drawn with curves where they bend gently, so rims no longer show facets or stair steps. Build and render time are unchanged, and the generated SVG and scene markup are slightly smaller than before.
