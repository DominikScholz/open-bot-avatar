---
"open-bot-avatar": minor
---

A definition can paint parts of its body in their own colors, wear accessories in front of its face, and circle itself with a ring.

`body.accents` lists up to three groups of subpaths by index, each with an optional `color` (`{ "parts": [3, 4], "color": "#d93025" }`); `body.color` sets the body's own color inside the JSON. The `accentColors` render and mount option overrides the group colors. An accent that lies on another part sits on that part's front and turns with it, and the accents that touch it or share its color ride along. A flat elliptical ring with a hole around another part turns as a tilted disc, passing in front of that part and behind it. A counter-clockwise subpath stays a hole even where another part covers it.

Definitions without these fields draw exactly as before. Flat, fluffy and glass all draw the new parts: fluffy grows a shorter pile on thin accents and tapers a wide one where it narrows, and glass keeps thin accents and the ring from blurring away.
