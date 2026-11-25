---
"open-bot-avatar": minor
---

`state` takes a definition of your own as well as one of the six names.

A definition is an `id` and a `pose` function that returns what differs from the resting pose: a lean, a look of the eyes, ribbons, or a mark the body gives way to. It works wherever a state does (`mountAvatar`, `update`, the render functions, `createAnimator`), eases to and from the built-in states, and takes a mood. Two definitions with one `id` are the same state. `stateDefinition` returns the definition behind a name, and the `AvatarStateDefinition` and `StateContext` types are exported.

States and marks of your own are experimental: they are written against the renderer's own model of a pose (`Pose`, `StateContext`, `MarkPart`), whose fields may still be renamed or removed in a minor release. The six names are stable.

A material draws a mark of your own too, each part in the shape of its outline: fur in fluffy, glass in glass. A part can set `round` to say it is a circle or an upright capsule, which a material draws from a ready ball as it does the built-in marks. A frame's `paths` carry the flag for the parts of marks. For this a material is one `render` function that draws the body and every part of a mark; `paintMark`, which the materials had before they were released, is gone.

The six names draw exactly as before, with one fix: when a change from one mark to another is interrupted (blocked on its way from thinking, then left), the marks could each weigh too little to show while the body had already gone. The body now stays, small, until a mark shows. `isState` and `resolveLook` still read names only.
