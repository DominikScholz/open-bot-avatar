---
"open-bot-avatar": minor
---

Six states and a mood of its own.

`state` is what the bot is doing: `idle`, `thinking`, `working`, `waiting`, `blocked` or `done`. `mood` is how it feels: `neutral`, `happy`, `surprised`, `angry` or `sad`. A mood shapes the eyes on top of any state, so a bot can be working and happy. `mountAvatar` and `update` take both; the render functions take `state`, `mood` and `stateAge`, and `STATES`, `MOODS`, `isState`, `isMood` and `resolveLook` are exported.

- `thinking` and `blocked` replace the body with a mark: three dots that hop in turn, and an exclamation mark. The body shrinks away as the mark grows in.
- `working` draws ribbons that circle the body, behind it and in front. `done` turns once with the ribbons flying, then settles. Hosts that animate pass `stateAge`; `createAnimator` returns it.
- Eyes morph from one shape to the next instead of swapping inside a blink. The plain pill and the happy arc are drawn as before; every look in between is a filled outline.
- Under reduced motion the ribbons are left out, the marks hold still and `done` does not turn.

What still works: `mood: "idle"`, `mood: "thinking"` and `mood: "happy"` in `mountAvatar`, and `motion` in the render functions. `idle` and `happy` draw exactly as before.

What changed for existing code:

- `thinking` now shows the three dots instead of the body looking up.
- Custom renderers: `EyeMark` gained `{ shape: "path", d }`, `FrameShape` gained `{ kind: "ribbon" }`, and `SceneFrame` gained `body`, `back`, `front` and a `d` per eye. The scene's markup has two overlays (`data-fx`) and a morphing outline per eye (`data-morph`).
- `Pose` replaces `eyeShape` with `eyes` (`arc`, `lid`, `slant`, `wide`) and adds `ribbons`, `bang` and `dots`. `MoodState` and the object form of `AvatarMotionBlend["from"]` take `state`, `mood` and `age`; `motion` there is deprecated.
- `AnimatorInput` takes `state` and `mood`, and `AnimatorStep` returns `stateAge`.
