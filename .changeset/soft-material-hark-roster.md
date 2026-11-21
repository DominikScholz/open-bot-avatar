---
"open-bot-avatar": minor
---

Add the `soft` body material: a subsurface-scattering colour ramp through the implied volume (port of the soft-shape shader from the Hark design study), in all three renderers — canvas, SVG still and CSS 3D scene. New `material` / `soft` options, `AvatarFrame.ramp` + slice `tone` for custom renderers, `softRamp` / `rampAt` / `sliceTone` helpers, and the `HARK_ROSTER` preset: eight contract-valid bots with Hark DS Rev 8 colours, per-colour material tuning and sky stops. Flat rendering is unchanged and remains the default.
