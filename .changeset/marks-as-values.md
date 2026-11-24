---
"open-bot-avatar": minor
---

`Pose` lists its marks as values. `Pose.marks` replaces `Pose.bang` and `Pose.dots`: each entry is a mark and how far the body has given way to it, so a mark is no longer a field of the pose. Code that builds a whole `Pose` by hand, or reads `bang` or `dots` from one, needs the new field; the `AvatarMark`, `MarkContext`, `MarkPart` and `PoseMark` types are exported for it.

Nothing else changes: `state`, `mood` and every render function take what they took, and every state draws exactly as before. Stills and scenes are the same text; a frame's data is the same apart from what the next entry adds.
