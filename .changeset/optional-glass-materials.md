---
"open-bot-avatar": minor
---

Add an opt-in glass material and separate material entry points so DOM consumers do not ship unused renderers.

Migration: import `fluffy` from `open-bot-avatar/materials/fluffy` and pass `material: fluffy` instead of the old `material: "fluffy"` string. Import `glass` from `open-bot-avatar/materials/glass` the same way. Flat remains the default, and the Studio keeps its existing serialized material names and links.
