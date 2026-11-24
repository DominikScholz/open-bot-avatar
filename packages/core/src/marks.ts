/**
 * Marks: what a body can give way to (the three dots of a thinking bot, the exclamation mark of
 * a blocked one). A mark is a value: an id and a function that lays its parts out about its own
 * centre. A pose names the marks it shows and how far the body has given way to each (see Pose
 * in motion.ts); effects.ts places them on the body and grows them in.
 */

const TAU = Math.PI * 2;
const f = (n: number) => {
  const r = Math.round(n * 100) / 100;
  return (Object.is(r, -0) ? 0 : r).toString();
};

export interface Box { x: number; y: number; w: number; h: number }

/** One part of a mark: a fixed outline about its own centre, and where that centre is this frame. */
export interface MarkPart {
  /**
   * Stable name of the outline, e.g. "dot". An avatar's frame lists each name's outline once, so
   * parts of one name share one outline: distinct outlines need distinct names, across marks.
   */
  shape: string;
  d: string;
  box: Box;
  /** Centre, viewBox units, then a rotation about the mark's centre (radians) and a scale about the part's own. */
  x: number;
  y: number;
  turn: number;
  scale: number;
  /**
   * The outline is a circle or an upright capsule that fills `box`. The fluffy material draws
   * such a part as a ball of fur; any other outline it fills plainly, so its shape is kept.
   */
  round?: boolean;
}

/** What a mark is laid out from. */
export interface MarkContext {
  /** The length every mark is sized in, viewBox units: a share of the body's smaller side. */
  unit: number;
  /** The animation clock, seconds, offset per avatar so several marks on a page do not move together. 0 when `still`. */
  time: number;
  /** Hold the mark at rest (reduced motion). */
  still: boolean;
}

export interface AvatarMark {
  /** Names the mark; a pose lists its marks in the order of their ids. */
  id: string;
  /** The mark's parts fully grown, with `x` and `y` measured from the mark's centre. */
  parts(ctx: MarkContext): MarkPart[];
}

/** A mark in a pose, and how far the body has given way to it, 0..1. */
export interface PoseMark {
  mark: AvatarMark;
  weight: number;
}

export const circle = (r: number) => `M${f(r)} 0A${f(r)} ${f(r)} 0 1 1 ${f(-r)} 0A${f(r)} ${f(r)} 0 1 1 ${f(r)} 0Z`;
export const capsule = (w: number, h: number) => {
  const r = w / 2, y = h / 2 - r;
  return `M${f(-r)} ${f(-y)}A${f(r)} ${f(r)} 0 0 1 ${f(r)} ${f(-y)}L${f(r)} ${f(y)}A${f(r)} ${f(r)} 0 0 1 ${f(-r)} ${f(y)}Z`;
};

/** The exclamation mark: it jumps and shakes every couple of seconds. */
export const BANG: AvatarMark = {
  id: 'bang',
  parts({ unit: u, time: t, still }) {
    const barW = 0.21 * u, barH = 0.5 * u, dot = 0.115 * u, gap = 0.1 * u;
    const total = barH + gap + 2 * dot;
    // One alarm every 2.6 s: a jump, with a shake that dies away as it lands.
    const p = still ? 1 : ((t % 2.6) + 2.6) % 2.6 / 2.6;
    const alarm = p < 0.3 ? p / 0.3 : 1;
    const jump = still ? 0 : Math.sin(Math.PI * alarm);
    const turn = still ? 0 : 0.2 * Math.sin(TAU * 3 * alarm) * (1 - alarm);
    const lift = -0.09 * u * jump;
    const barY = -total / 2 + barH / 2, dotY = total / 2 - dot;
    // The dot lags the bar on the way up, so the mark stretches as it jumps.
    return [
      { shape: 'bar', d: capsule(barW, barH), box: { x: -barW / 2, y: -barH / 2, w: barW, h: barH }, x: 0, y: barY + lift, turn, scale: 1, round: true },
      { shape: 'dot', d: circle(dot), box: { x: -dot, y: -dot, w: 2 * dot, h: 2 * dot }, x: 0, y: dotY + lift * 0.45, turn, scale: 1, round: true },
    ];
  },
};

/** The three dots: they take turns hopping. */
export const DOTS: AvatarMark = {
  id: 'dots',
  parts({ unit: u, time: t, still }) {
    const r = 0.1 * u, step = 0.31 * u;
    return [0, 1, 2].map((i) => {
      // Each dot hops in turn, a beat after the one before it.
      const p = still ? 0 : (((t - i * 0.17) % 1.25) + 1.25) % 1.25 / 1.25;
      const hop = p < 0.4 ? Math.sin(Math.PI * (p / 0.4)) : 0;
      return { shape: 'dot3', d: circle(r), box: { x: -r, y: -r, w: 2 * r, h: 2 * r }, x: (i - 1) * step, y: -0.16 * u * hop, turn: 0, scale: 1 + 0.12 * hop, round: true };
    });
  },
};

/**
 * The marks of a pose part way between two, each weight mixed (a mark only one side shows counts
 * as 0 on the other), in the order of their ids so the result does not depend on which side came
 * first. A mark that has gone altogether is left out.
 */
export function blendMarks(a: readonly PoseMark[], b: readonly PoseMark[], mix: (x: number, y: number) => number): PoseMark[] {
  const weight = (list: readonly PoseMark[], id: string) => list.find((m) => m.mark.id === id)?.weight ?? 0;
  const marks = [...a, ...b.filter((m) => !a.some((n) => n.mark.id === m.mark.id))].map((m) => m.mark);
  return marks
    .map((mark) => ({ mark, weight: mix(weight(a, mark.id), weight(b, mark.id)) }))
    .filter((m) => m.weight > 0)
    .sort((m, n) => (m.mark.id < n.mark.id ? -1 : m.mark.id > n.mark.id ? 1 : 0));
}
