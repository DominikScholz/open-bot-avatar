---
"open-bot-avatar": minor
---

`state` takes a definition of your own as well as one of the six names.

A definition is an `id` and a `pose` function that returns what differs from the resting pose: a lean, a look of the eyes, ribbons, or a mark the body gives way to. It works wherever a state does (`mountAvatar`, `update`, the render functions, `createAnimator`), eases to and from the built-in states, and takes a mood. Two definitions with one `id` are the same state. `stateDefinition` returns the definition behind a name, and the `AvatarStateDefinition` and `StateContext` types are exported.

The six names draw exactly as before. `isState` and `resolveLook` still read names only.
