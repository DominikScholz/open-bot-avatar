---
"open-bot-avatar": patch
---

Reduce flat frame assembly and ribbon sampling work. Build fluffy meshes with fewer distance calculations and pack hair roots in draw order. Speed up glass texture baking without changing the rendered output. Skip unchanged avatar mounts in the shared frame loop and reuse prepared geometry across live frames.
