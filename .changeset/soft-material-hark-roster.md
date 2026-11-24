---
"open-bot-avatar": minor
---

Add the `soft` body material: the soft-shape subsurface look of the Hark design study, ported per-pixel in the canvas renderer (`softsprite.ts`: signed-distance field + 16-tap key-light integral, one cached sprite per outline/colour/material) with a cross-section colour ramp (`material.ts`) as the vector fallback. New `material` / `soft` options, `AvatarFrame.softBody` / `.ramp` + slice `tone` for custom renderers, `softSprite` / `softRamp` / `rampAt` / `sliceTone` helpers, and the `HARK_ROSTER` preset: eight contract-valid bots with Hark DS Rev 8 colours, per-colour material tuning and sky stops. States, moods, ribbons, marks and gaze keep working; flat rendering is unchanged and remains the default.
