---
"open-bot-avatar": minor
---

Add an opt-in glass material and separate material entry points so DOM consumers do not ship unused renderers.

Migration: import `fluffy` from `open-bot-avatar/materials/fluffy` and pass `material: fluffy` instead of the old `material: "fluffy"` string. Import `glass` from `open-bot-avatar/materials/glass` the same way. The old string draws flat and logs one warning that names the import. Flat remains the default, and the Studio keeps its existing serialized material names and links.

The `AvatarMaterial` type moves from `open-bot-avatar` to `open-bot-avatar/dom`, so the root entry has no DOM types in it. `CanvasMaterial`, the interface a material implements, is experimental: it is given the renderer's own model of the body, and may change in a minor release.
