---
"open-bot-avatar": minor
---

Seven new moods: `excited`, `celebrate`, `determined`, `surprised`, `angry`, `sad` and `sleepy`. `MOTIONS` lists every mood and `isMotion` checks a value.

A new `activity` option shows what the bot is doing on top of its mood: `thinking`, `listening`, `speaking`, `working`, `waiting`, `success` or `error`. The mood keeps the face (eye shape, face placement, posture); the activity sets the rhythm, gaze and body movement, so a bot can be working and happy, working and sad, or waiting and sleepy. `mountAvatar` and `update` take `activity` next to `mood`, the pure render functions take it next to `motion`, `AvatarMotionBlend`'s object form and `MoodState` gained an optional `activity`, and leaving it out means no activity. The `AvatarActivity` type, `ACTIVITIES` and `isActivity` are exported.

`thinking` moved from the mood list to the activity list, so `MOTIONS` no longer contains it. `mood: "thinking"` keeps working: it still passes `isMotion` and now means the thinking activity with no particular mood.

Eyes are now shaped per mood (size, tilt, lids, arches) and morph from one mood to the next instead of swapping inside a blink, and the face can move across the body. Each avatar only gets as much of an expression as its silhouette has room for, so eyes always stay inside the outline; definitions and validation are unchanged.

Breaking for custom renderers: `EyeMark` from `avatarFrame` is now always `{ shape: "path", d }`, a filled outline. `sceneFrame` eyes are `{ visible, d }`. `Pose` replaces `squintL`, `squintR` and `eyeShape` with `eyes`, `faceX` and `faceY`.
