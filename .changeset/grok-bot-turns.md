---
"open-bot-avatar": minor
---

Add the Grok Bot's turns and the rest of its motion states.

`AvatarMotion` now covers `idle`, `working`, `waiting`, `blocked`, `thinking` and
`done`. `RenderOptions` grows three turns: `faceTurn`, which rides the eye pair
around the head's cross-section so it narrows and goes edge-on as it turns away;
`bodyTurn`, the body's turn about its own vertical axis, in depth, so the shape
turns to show its side and its back the way the Grok Bot spins inside its belt
while it celebrates; and `faceWhirl`, the face's turn in the picture plane about
the body's centre, so the eyes swing around the head instead of sliding across
it.

`paintBelt` gives paint that rides around the avatar its geometry: the centre of
the shape's bounds, half its widest row (the belt's radius) and its widest
dimension. `happy` now starts its loop with the mood when `motionAge` is given.

The site's editor cycles the six states; a saved look or `?mood=happy` link now
opens on `done`.
