import type { AvatarMark, AvatarStateDefinition } from "open-bot-avatar";

// A mark is an id and the outlines it is made of, placed from the mark's center.
// This one is a question mark: a hook over a dot, sized in `unit`.
export const question: AvatarMark = {
  id: "question",
  parts: ({ unit: u, time }) => {
    const arc = (r: number, large: 0 | 1, sweep: 0 | 1, x: number, y: number) =>
      `A${r * u} ${r * u} 0 ${large} ${sweep} ${x * u} ${y * u}`;
    const hook = [
      `M${-0.26 * u} ${-0.062 * u}`,
      arc(0.26, 1, 1, 0.13, 0.163),
      arc(0.08, 0, 0, 0.09, 0.232),
      arc(0.09, 0, 1, -0.09, 0.232),
      arc(0.26, 0, 1, 0.04, 0.007),
      arc(0.08, 1, 0, -0.08, -0.062),
      arc(0.09, 0, 1, -0.26, -0.062),
      "Z",
    ].join("");
    const w = 0.52 * u, h = 0.645 * u, r = 0.115 * u, gap = 0.1 * u;
    const dot = `M${r} 0A${r} ${r} 0 1 1 ${-r} 0A${r} ${r} 0 1 1 ${r} 0Z`;
    const top = -(h + gap + 2 * r) / 2;
    // The mark tilts from side to side. `time` is 0 under reduced motion, so it holds still.
    const turn = 0.12 * Math.sin(2.4 * time);
    return [
      {
        shape: "question-hook",
        d: hook,
        box: { x: -w / 2, y: -h / 2, w, h },
        x: 0,
        y: top + h / 2,
        turn,
        scale: 1,
      },
      {
        shape: "question-dot",
        d: dot,
        box: { x: -r, y: -r, w: 2 * r, h: 2 * r },
        x: 0,
        y: -top - r,
        turn,
        scale: 1,
        round: true, // A circle that fills its box: a material draws it from a ready ball.
      },
    ];
  },
};

// The body gives way to the mark: the bot needs an answer.
export const asking: AvatarStateDefinition = {
  id: "asking",
  pose: () => ({ marks: [{ mark: question, weight: 1 }] }),
};

// The body stays: calm as in idle, leaning, with narrowed eyes.
export const listening: AvatarStateDefinition = {
  id: "listening",
  pose: (ctx) => ({ ...ctx.rest(), roll: 6 + ctx.wave(4), squintL: 0.3, squintR: 0.3 }),
};
