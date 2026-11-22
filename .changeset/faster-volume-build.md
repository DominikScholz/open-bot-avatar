---
"open-bot-avatar": patch
---

An avatar's first render is about four times faster. The one-time volume build behind it (cross-sections, part depths, eye placement) took 26 to 72 ms per avatar in Chrome and now takes 4 to 12 ms once the page has built a few; a page that shows many avatars at once is unblocked that much sooner. Stills, frames and scenes come out exactly as before.
