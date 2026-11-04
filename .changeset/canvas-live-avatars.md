---
"open-bot-avatar": minor
---

Add `renderer: 'canvas'` to `mountAvatar`: a live avatar paints to one canvas instead of a CSS 3D scene, holding one compositor layer rather than one per visible slice. The scene stays the default. `avatarExtent` is new, and `avatarFrame` thins slices when given `size`.
