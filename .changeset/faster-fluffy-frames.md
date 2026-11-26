---
"open-bot-avatar": patch
---

Fluffy draws in about half the time. Triangles that face away are culled, the outermost shell of pile is left out where it draws nothing, and the shells follow the plain triangles around the eyes. An avatar drawn small also uses a mesh of fewer triangles and a shorter brush, which builds faster and holds less memory. Every strand stays where it was; at small sizes the surface under the strands differs by a shade in a few pixels. No API changes.
