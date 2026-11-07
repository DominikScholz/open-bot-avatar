---
"open-bot-avatar": minor
---

Seven new moods: `excited`, `celebrate`, `determined`, `surprised`, `angry`, `sad` and `sleepy`. `MOTIONS` lists every mood and `isMotion` checks a value.

Eyes are now shaped per mood (size, tilt, lids, arches) and morph from one mood to the next instead of swapping inside a blink, and the face can move across the body. Each avatar only gets as much of an expression as its silhouette has room for, so eyes always stay inside the outline; definitions and validation are unchanged.

Breaking for custom renderers: `EyeMark` from `avatarFrame` is now always `{ shape: "path", d }`, a filled outline. `sceneFrame` eyes are `{ visible, d }`. `Pose` replaces `squintL`, `squintR` and `eyeShape` with `eyes`, `faceX` and `faceY`.
