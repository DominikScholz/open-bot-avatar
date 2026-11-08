---
"open-bot-avatar": minor
---

Add the Grok Bot's turns and the rest of its motion states.

`AvatarMotion` now covers `idle`, `working`, `waiting`, `blocked`, `thinking` and
`done`, and `RenderOptions` grows two turns: `faceTurn`, which rides the eye
pair around the head's cross-section so it narrows and goes edge-on as it turns
away, and `bodyTurn`, the body's turn about its own vertical axis, in depth, so
the shape turns to show its side and its back the way the Grok Bot spins inside
its belt while it celebrates.
