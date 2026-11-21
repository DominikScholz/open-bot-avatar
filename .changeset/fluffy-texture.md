---
"open-bot-avatar": minor
---

A fluffy texture.

`texture: "fluffy"` grows the body's outline into soft tufts of fur. `mountAvatar`, `update` and the render functions take it; `"smooth"` stays the default, and smooth avatars render exactly as before. `AvatarTexture`, `TEXTURES` and `isTexture` are exported.

- The fur is geometry like the rest of the body, drawn in its one flat color, so the SVG still, the canvas and the CSS 3D scene all show it. Tufts only grow outward, so the eyes keep their room.
- Live, the fur sways in a gentle breeze and trails behind the body as it rolls and turns. It stands still under reduced motion and in the `"scene"` renderer.
- Fluffy SVG stills are larger: about half again at rest for a typical avatar.
