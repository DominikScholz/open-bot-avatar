---
"open-bot-avatar": minor
---

Live avatars paint to one canvas by default instead of a CSS 3D scene: one compositor layer and a small bitmap per avatar rather than a layer per visible slice, so pages with many avatars use far less CPU, memory and DOM and keep a steady frame rate. The bitmap covers what is actually painted. Pass `renderer: "scene"` to `mountAvatar` for the previous scene, which uses less video memory for a single avatar several hundred pixels wide; it is also the fallback without canvas support. `color` and `eyeColor` now accept any CSS color, and `avatarFrame` paths gain a `box`.
