/**
 * The Grok Bot's paint.
 *
 * The band is not a ring drawn around the head. On the official page it is a
 * particle system: every particle rides a tilted orbit around the face and
 * drags a tapering wake behind it, and the wake is split by depth into a layer
 * behind the body and a layer in front of it, so the paint crosses the face.
 *
 * The detail that ties the whole thing together: the particle's orbital angle
 * advances with the very signal that turns the bot (`o.lam += w * o.follow`,
 * where `w` is the spin speed), and the bot's turn is driven by the same
 * signal. The paint and the face are therefore phase locked — while the face
 * turns, the band turns with it. This module keeps that coupling: one spin
 * clock drives the face turn, the body's turn and the paint, and the paint
 * reads its speed from the clock.
 *
 * The band does not live on its own, though. On the official the paint only
 * moves because the bot is turning: the turn is the signal, and the strokes
 * ride it. When the turn is over the strokes draw back in and the band is
 * gone, and the bot stands there plain until the next turn comes round. A band
 * that keeps circling on its own never ends, and a band that never ends has no
 * ending to get right.
 *
 * What the official's band goes round is its bot, and the rule for that is a
 * single measurement: the belt is half of the shape's widest row. The
 * official's bot is a round head that fills its design space, so its widest
 * row is 228.54 across and the belt rides at 116 — just off the rim. Read the
 * same way here, our own avatar is one body however it is drawn: the belt is
 * half of its widest row, so the paint comes from around the whole shape and
 * stands just off it. The hoop is one ring, not a loop drawn along the
 * outline.
 *
 * The near side of the hoop is its top, and the far side its bottom, the way
 * the official's ring sits at the bot's eye height with the camera looking up
 * at it. So the band crosses in front of the character along its top and
 * passes behind it along the bottom, and the character is genuinely wrapped.
 *
 * The official's ring is not flat: it is a ring in three dimensions, tipped out
 * of the screen, so one end of it comes towards the viewer and the other goes
 * away, and the ring is read from its own depth rather than from a guess. The
 * band here is tipped the same way, and the picture shows the ring foreshortened
 * into an ellipse: the hoop's near side crosses the character along its top and
 * its far side passes behind it along its bottom.
 *
 * The official tells its lane sets apart by rolling them in the picture, not by
 * moving them along the orbit, so the three hoops cross one another and the
 * paint reads as a cage around the body instead of one flat halo or a set of
 * rings.
 *
 * The paint lives in the avatar's own space but outside the body's animated
 * group, exactly as on the official: it follows the view the user dragged the
 * avatar into, and it keeps its own place in the world while the body turns.
 */
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, type RefObject } from "react";
import { paintBelt, type AvatarDefinition } from "open-bot-avatar";

export type BandMode = "working" | "done";

/** What the paint and the avatar share: the turn and its speed. */
export interface BandSpin {
  /**
   * The turn of the face inside the head, in radians. The official turns the
   * face on the head's cross-section, so this is the angle the face is turned
   * by, not a flat spin: the eyes swing around the head and go edge-on.
   */
  face: number;
  /** The angle the paint's strokes start at, in radians. */
  angle: number;
  /**
   * The body's turn about its own vertical axis, in radians. The official spins
   * its bot inside its belt, in depth, around the bot's own centre, so the
   * shape turns under the paint while the paint stays where it is.
   */
  bodyTurn: number;
  /**
   * The face's turn in the picture plane, about the body's centre, in radians.
   * The official turns its whole head while it celebrates and the eyes ride
   * that turn, so the eye swings round the head the same way round as the
   * paint sweeps round the body.
   */
  whirl: number;
  /** The speed of the turn, in radians per second. */
  rate: number;
  /** Whether the head is spinning, so the face can step out of the way. */
  spinning: boolean;
}
export interface BandHandle {
  /** Advance the spin clock and the paint one frame; returns the shared spin. */
  step(dt: number, mode: BandMode | null): BandSpin & { painting: boolean };
}

const TAU = Math.PI * 2;
const NS = "http://www.w3.org/2000/svg";

/**
 * The official draws its shapes in a 228.541 unit design space, and scales
 * every shape to fill it. Our shapes keep their own size, so the paint's
 * constants (the lane ladder, the stroke's width) are scaled by the shape's
 * own size instead: one design unit is this many of the avatar's units.
 */
const DESIGN = 228.541;
/**
 * The official's orbit sits just outside the body's rim: 116 on a 114.27 radius.
 */
const ORBIT = 116 / 114.2705;
/**
 * The official's size rule for the brush: its reference size, and its bounds.
 *
 * The official thins the brush as its bot grows: the weight is (340/width)^0.7,
 * between 1 and 2.6. But the official never draws its bot larger than 128 px,
 * so every official rendering has the boost on, and the thinnest band it ever
 * draws is the one at its own figure's size, 1.98. Ours is drawn larger than
 * that and its shapes are not the official's round head, so the floor is the
 * weight of the official's own figure: the band keeps the official's
 * proportions instead of thinning into bare wires.
 */
const SIZE_REF = 340;
const SIZE_MIN = 1.98;
const SIZE_MAX = 2.6;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const smooth = (u: number) => { const x = clamp(u, 0, 1); return x * x * (3 - 2 * x); };
/** The official rounds its path numbers to a tenth. */
const round = (v: number) => Math.round(v * 10) / 10;

/**
 * The official's size rule for the brush: the stroke's weight follows the size
 * the bot is drawn at, so a small bot gets a fatter brush and a large one a
 * finer one. Its own bot is 128 px wide, where the rule gives the stroke 1.98
 * times its design width; a bot drawn at 340 px or more gets 1.0.
 *
 * Ours is drawn larger than the official's bot, so the rule is held at the
 * official's figure: the band keeps the weight the official's own figure has
 * at any size, and a bot smaller than that gets the official's boost.
 */
export function paintSizeScale(cssWidth: number): number {
  if (!(cssWidth > 0)) return SIZE_MIN;
  return clamp((SIZE_REF / cssWidth) ** 0.7, SIZE_MIN, SIZE_MAX);
}

/** Deterministic 0..1 stream, so a reload paints the same burst. */
function seeded(key: string) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  let s = h >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// The spin clock

/** The official's spring: v += (-2dkv - k²(x-t))dt, with k = 6.2 and d = 1. */
const SPIN_K = 6.2;
const SPIN_DAMPING = 1;
/** The official steps its spring a hundred and twenty times a second. */
const SPIN_STEP = 1 / 120;
/** Working turns the face one full circle per impulse. */
const WORKING_TURNS = 1;
/** Seconds between the working impulses (the official: six to nine). */
const WORKING_MIN = 6;
const WORKING_MAX = 9;
/**
 * The official arms the first working turn for 1.2 to 2.4 seconds after the
 * state arrives, then fires one every six to nine seconds.
 */
const WORKING_FIRST_MIN = 1.2;
const WORKING_FIRST_MAX = 2.4;
/** Done: the paint sweeps nine times and the head three, every 6.2 s. */
const DONE_CYCLE = 6.2;
const DONE_TURNS = 9;
/** How long one done turn lasts. */
const DONE_SPAN = 5.49;
/** The official waits a beat before the first turn of the celebration. */
const DONE_FIRST = 0.14;
/** The slope of the done turn's steady stretch, from the official's curve. */
const DONE_SLOPE = (DONE_TURNS * TAU + 0.5) / (0.15 + 2 + 0.3125);
/**
 * The done turn's shape, copied from the official: a short wind-up, a long
 * steady turn, a flourish, and a landing. `turn` is the face's angle in
 * radians.
 */
function doneProfile(t: number): number {
  const s = DONE_SLOPE;
  const full = DONE_TURNS * TAU;
  if (t < 0.24) {
    const u = (t / 0.24) * Math.PI;
    return (-0.5 * (1 - Math.cos(u))) / 2;
  }
  if (t < 0.54) {
    const e = t - 0.24;
    return -0.5 + (s * e * e) / 0.6;
  }
  if (t < 2.54) {
    return -0.5 + s * (0.15 + (t - 0.54));
  }
  if (t < 3.79) {
    const e = t - 2.54;
    const k = 1 - e / 1.25;
    return -0.5 + s * 2.15 + (1.25 * s * (1 - k ** 4)) / 4;
  }
  return full;
}

/**
 * The spin the paint and the avatar share.
 *
 * The official keeps one spring for the whole bot: a turn it has started is
 * finished even when the state changes under it, and the state only decides
 * when the next turn is armed. The paint rides that turn, so a band that is
 * already sweeping keeps sweeping while the bot settles into the next state.
 */
export class SpinClock {
  private mode: BandMode | null = null;
  /** The clock the turns are armed on. */
  private time = 0;
  /** The turn of the face inside the head. */
  private face = 0;
  /** The turn of the paint's strokes. */
  private angle = 0;
  /** The body's own turn about its vertical axis, in radians. */
  private bodyTurn = 0;
  /** The face's turn in the picture plane, about the body's centre. */
  private whirl = 0;
  /** The turn's angle at the end of the last frame. */
  private prevAngle = 0;
  /** The turn in progress. It outlives the state that started it. */
  private x = 0;
  private v = 0;
  private target = 0;
  private turning = false;
  /** The time of the next turn, on the clock's own time. */
  private next = 0;
  /** The celebration's own clock. */
  private doneT = 0;
  /** Which celebration turn we are in, and which way it turns. */
  private cycle = -1;
  private dir = 1;
  private rand = seeded("grok-spin");

  step(dt: number, mode: BandMode | null): BandSpin {
    this.time += dt;
    if (mode !== this.mode) {
      this.mode = mode;
      // The official arms the next turn when the state changes: the working
      // bot waits 1.2 to 2.4 seconds for its first turn. The turn that is
      // already running is left alone.
      if (mode === "working") {
        this.next = this.time + WORKING_FIRST_MIN + this.rand() * (WORKING_FIRST_MAX - WORKING_FIRST_MIN);
      }
      this.doneT = 0;
      this.cycle = -1;
    }
    // The turn is armed by the clock, not by the state: the official fires it
    // when the time comes, and lets it pass when a turn is already running.
    if (mode === "working" && this.time >= this.next) {
      this.next = this.time + WORKING_MIN + this.rand() * (WORKING_MAX - WORKING_MIN);
      if (!this.turning) {
        this.x = 0;
        this.v = 0;
        this.target = WORKING_TURNS * TAU;
        this.turning = true;
      }
    }
    // The rate the paint orbits at. On the official the paint only ever moves
    // because the bot is turning: the band is the turn, drawn in colour. When
    // the turn is over the paint stops, and the strokes draw back in.
    if (this.turning) {
      // A turn that has started is finished, whatever the state does.
      this.stepTurn(dt);
    } else if (mode === "done") {
      this.stepDone(dt);
    } else {
      this.face = 0;
      this.bodyTurn = 0;
      this.whirl = 0;
    }
    return this.read(dt);
  }

  /**
   * The turn, and the speed of the turn.
   *
   * The speed is not the spring's speed at the end of the frame but the
   * average the turn actually had over it: the official reads the paint's
   * orbits off that average, so the ribbon and the face move together. Read
   * the spring's own speed instead and the ribbon runs ahead of the face at
   * the start of every turn, then falls behind at the end.
   */
  private read(dt: number): BandSpin {
    let delta = this.angle - this.prevAngle;
    // A turn that jumps (a new turn starting where the last one ended) is not
    // a movement: the official reads it as a standstill.
    if (!Number.isFinite(delta) || Math.abs(delta) > 1.2) delta = 0;
    this.prevAngle = this.angle;
    const rate = dt > 0 ? delta / dt : 0;
    return {
      face: this.face,
      angle: this.angle,
      bodyTurn: this.bodyTurn,
      whirl: this.whirl,
      rate,
      spinning: this.turning || rate !== 0,
    };
  }
  /**
   * The turn: the spring turns the face once, and the paint's strokes ride
   * the very same turn. It runs to the end even when the state changes under
   * it, so the band finishes its sweep before it draws back in.
   */
  private stepTurn(dt: number) {
    const k = SPIN_K;
    // The official runs the spring in hundred-and-twentieths of a second, so
    // the turn lands the same way whatever the frame rate is.
    const steps = Math.max(1, Math.ceil(dt / SPIN_STEP));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.v += (-2 * SPIN_DAMPING * k * this.v - k * k * (this.x - this.target)) * h;
      this.x += this.v * h;
    }
    // The face and the paint are phase locked: the same turn moves both. The
    // official's paint reads the spring's own angle, so the band's arc starts
    // again with every turn.
    this.face = this.x;
    this.angle = this.x;
    // The official turns its head in the picture only for the celebration, so
    // the working turn leaves the face where it is.
    this.whirl = 0;
    if (Math.abs(this.target - this.x) < 0.004 && Math.abs(this.v) < 0.015) {
      // The turn is over: the face goes back to the middle, as on the official.
      this.turning = false;
      this.face = 0;
    }
  }

  /**
   * The done turn: the paint sweeps nine times around the bot while the head
   * turns three times with it, and the eyes ride the very same sweep.
   */
  private stepDone(dt: number) {
    this.doneT += dt;
    const clock = this.doneT - DONE_FIRST;
    if (clock < 0) {
      this.face = 0;
      this.angle = 0;
      this.bodyTurn = 0;
      this.whirl = 0;
      return;
    }
    const cycle = Math.floor(clock / DONE_CYCLE);
    if (cycle !== this.cycle) {
      this.cycle = cycle;
      // The official turns each celebration a random way.
      this.dir = this.rand() < 0.5 ? 1 : -1;
    }
    const u = clock - cycle * DONE_CYCLE;
    if (u >= DONE_SPAN) {
      this.face = 0;
      this.angle = 0;
      this.bodyTurn = 0;
      this.whirl = 0;
      return;
    }
    const p = doneProfile(u);
    this.angle = this.dir * p;
    // The body turns three times while the paint sweeps nine: the shape turns
    // about its own vertical axis, in depth, the way the official's bot spins
    // inside its belt. The face rides the paint's sweep, as on the official.
    this.bodyTurn = this.angle / 3;
    // The official turns its head in the picture as well, three turns for the
    // paint's nine, and the eyes ride that turn: they swing round the head
    // instead of sliding across it, and they go round the same way as the
    // paint goes round the body.
    this.whirl = this.angle / 3;
    this.face = this.angle;
  }
}

// ---------------------------------------------------------------------------
// The paint

/** The official only lets the paint out once the turn is quick enough. */
const SPAWN_RATE = 5;
/** Below this the bot counts as at rest, and the paint draws back in. */
const REST_RATE = 0.9;
/** Radians of orbit between two wake samples. */
const SAMPLE = 0.09;
/** Wake samples added per frame at most. */
const SAMPLE_MAX = 24;
/** Wake samples kept. */
const HISTORY = 48;
/** The wake's length, in radians of orbit. */
const ARC_MIN = 2.2;
const ARC_MAX = 3.4;
/** How much of the turn each particle keeps up with. */
const FOLLOW_MIN = 0.74;
const FOLLOW_MAX = 0.94;
/** How long a stroke lives, in seconds. */
const LIFE = 9;
/**
 * The hoop's own shape, measured from the official's live working paint: the
 * ring is tipped 0.386 out of the screen and rolled 0.157 out of the face's
 * plane. The official's random is seeded, so its plan is the same on every
 * load and these are the angles its paint always draws with.
 */
const HOOP_ROLL = 0.157;
const HOOP_TILT = 0.386;

type Point3 = { x: number; y: number; l: number; z: number };

type Spec = {
  /** Which lane of the ladder the stroke rides; the lanes sit at different radii. */
  lane: number;
  /** How far apart the lanes sit. */
  laneStep: number;
  /** How far the hoop is turned in the picture, in radians. */
  roll: number;
  /** How deep the hoop passes in front of the body and behind it, in radians. */
  tilt: number;
  /** The colour's drift along the ribbon, in degrees. */
  hue: number;
  hueSpan: number;
  hueVel: number;
  /** The ribbon's width, in the shape's own units. */
  width: number;
  /** The wake's length, in radians of orbit. */
  arc: number;
  /** How much of the turn this particle keeps up with. */
  follow: number;
  /** The drift the particle keeps when the bot rests. */
  lamVel: number;
  /** How fast the orbit widens. */
  radVel: number;
  /** How far the orbit has widened so far. */
  grow: number;
};

type Stroke = {
  spec: Spec;
  /** The particle's orbital angle. */
  lam: number;
  /** The turn the particle keeps up with once the bot rests. */
  carry: number;
  life: number;
  /** 0 = whole, 1 = gone. */
  ret: number;
  /** The wake, oldest first. */
  hist: Point3[];
  back: SVGPathElement;
  front: SVGPathElement;
  grad: SVGLinearGradientElement;
  stops: SVGStopElement[];
  /** The hue last written to the gradient, so it is not rewritten every frame. */
  written: number;
};

class Paint {
  private strokes: Stroke[] = [];
  private back: SVGSVGElement | null = null;
  private front: SVGSVGElement | null = null;
  private defs: SVGSVGElement | null = null;
  /** The centre of the shape, in the avatar's 0..100 space: the face. */
  private cx = 50;
  private cy = 50;
  /**
   * The belt's radius: half of the shape's widest row, as the official
   * measures it. The band rides this, so the hoop is one ring standing off
   * the body instead of a loop drawn along its outline.
   */
  private belt = 40;
  /** One design unit, in the avatar's units: the paint's constants scale by it. */
  private unit = 1;
  /** The brush's weight, from the official's size rule. */
  private sizeScale = 1;
  private boxWidth = 0;
  private boxHeight = 0;
  private boxLeft = 0;
  private boxTop = 0;
  private rand = seeded("grok-paint");
  private plan: Spec[] = [];
  /** The strokes waiting to be let out, with the time each one starts. */
  private queue: { spec: Spec; at: number }[] = [];
  /** Whether the strokes may still be let out. */
  private armed = false;
  private spinning = false;
  private counter = 0;
  private now = 0;
  private view: HTMLElement | null = null;
  private lastTransform = "";

  /** Whether the paint still has strokes on the page. */
  get painting() {
    return this.strokes.length > 0;
  }

  attach(definition: AvatarDefinition, back: SVGSVGElement | null, front: SVGSVGElement | null, defs: SVGSVGElement | null) {
    this.back = back;
    this.front = front;
    this.defs = defs;
    try {
      const { cx, cy, belt, widest } = paintBelt(definition);
      this.cx = cx;
      this.cy = cy;
      this.belt = belt;
      // The official's design space is filled by the shape, so its constants
      // are scaled by the shape's own size.
      this.unit = Math.max(widest, 1) / DESIGN;
    } catch {
      this.cx = 50;
      this.cy = 50;
      this.belt = 25;
      this.unit = 1;
    }
    const origin = `${round(this.cx)}% ${round(this.cy)}%`;
    for (const svg of [back, front]) if (svg) svg.style.transformOrigin = origin;
    this.clear();
  }

  /**
   * The paint shares the avatar's box: the same 100 units, the same pixels,
   * so the strokes sit on the body instead of around it.
   *
   * The offset is measured against the paint's own parent, which is the box
   * the paint is placed in, so the paint lands on the scene whatever else the
   * page puts around it.
   */
  private layout(host: HTMLElement | null) {
    const svg = this.back;
    if (!host || !svg) return;
    // Both renderers fill the host: the scene mounts a box of its own, the
    // canvas paints a wrapper of the same size, so the host is the box.
    const scene = host.querySelector<HTMLElement>("[data-avatar-scene]") ?? host;
    const s = scene.getBoundingClientRect();
    if (!s.width) return;
    const parent = svg.parentElement ?? host;
    const p = parent.getBoundingClientRect();
    const left = s.left - p.left - parent.clientLeft;
    const top = s.top - p.top - parent.clientTop;
    if (s.width === this.boxWidth && s.height === this.boxHeight && left === this.boxLeft && top === this.boxTop) return;
    this.boxWidth = s.width;
    this.boxHeight = s.height;
    this.boxLeft = left;
    this.boxTop = top;
    // The official reads its brush's weight off the size the bot is drawn at,
    // so a small bot gets a fatter brush and a large one a finer one.
    this.sizeScale = paintSizeScale(s.width);
    for (const el of [this.back, this.front]) {
      if (!el) continue;
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
      el.style.width = `${s.width}px`;
      el.style.height = `${s.height}px`;
    }
  }

  /**
   * Bring the paint onto the avatar's box and view without waiting for a
   * frame: the page's animation loop sleeps while nothing moves, and a
   * sleeping loop cannot notice that the layout changed under it.
   */
  sync(host: HTMLElement | null) {
    this.layout(host);
    this.copyView(host);
  }

  private clear() {
    for (const s of this.strokes) {
      s.back.remove();
      s.front.remove();
      s.grad.remove();
    }
    this.strokes = [];
    this.queue = [];
    this.armed = false;
    this.spinning = false;
  }

  /**
   * The plan for one spin: the lanes the strokes ride and the strokes
   * themselves.
   *
   * The official runs two plans, and the state picks between them. The
   * celebration runs the wide plan: three hoops, each rolled a third of a turn
   * from the last, with three strokes on each hoop, nine strokes on three
   * rings at once. The working turn runs the narrow plan: one hoop, three to
   * five strokes on it.
   *
   * That difference is the whole look of the two states. The narrow plan is
   * why the official's working bot wears a single broad band of paint drawn
   * across it, and the wide plan is why the celebration reads as a cage of
   * rings around it.
   *
   * The strokes on one hoop are told apart by the radius they ride, not by
   * moving along the orbit: the official steps the lanes 38 design units
   * apart in total, whatever the number of lane sets is.
   */
  private makePlan(wide: boolean): Spec[] {
    // The official's lane sets: three hoops in the wide plan, one in the
    // narrow one.
    const sets = wide ? 3 : 1;
    // The official's stroke count: three strokes on each of the wide plan's
    // three hoops, and three to five strokes on the narrow plan's one hoop.
    const count = sets > 1 ? 3 * sets : Math.round(3 + this.rand() * 2);
    // The radius ladder: the official steps the lanes 38 design units apart in
    // total, whatever the number of lane sets is.
    const laneStep = (38 * this.unit) / Math.max(Math.ceil(count / sets) - 1, 1);
    // The hoop is rolled a little, the way the official tips its rings, but
    // only a little: our avatars are not round, and a hoop rolled far would
    // cut across them instead of going around them.
    const base = HOOP_ROLL;
    const hueBase = this.rand() * 360;
    // Each lane set is its own hoop, and the official tells them apart by
    // rolling them in the picture, not by moving them along the orbit: three
    // hoops rolled a third of a turn apart cross each other, and the paint
    // reads as a cage around the character instead of a set of rings.
    const hoops: { roll: number; tilt: number }[] = [];
    for (let i = 0; i < sets; i++) {
      hoops.push({
        roll: base + (i * Math.PI) / sets + (this.rand() - 0.5) * 0.24,
        tilt: HOOP_TILT,
      });
    }
    const out: Spec[] = [];
    for (let a = 0; a < count; a++) {
      // The stroke belongs to one lane set and rides one radius.
      const set = a % sets;
      const lane = Math.floor(a / sets);
      // The official's stroke width: the more strokes there are, the narrower
      // each of them is.
      const r =
        count <= 3
          ? 8 + this.rand() * 2.5
          : count === 4
            ? 6.6 + this.rand() * 2
            : 5.6 + this.rand() * 1.8;
      out.push({
        lane,
        laneStep,
        roll: hoops[set].roll + (this.rand() - 0.5) * 0.1,
        tilt: hoops[set].tilt + (this.rand() - 0.5) * 0.08,
        hue: hueBase + (360 * a) / count + (this.rand() - 0.5) * 28,
        hueSpan: (45 + this.rand() * 50) * (this.rand() < 0.5 ? 1 : -1),
        hueVel: (18 + this.rand() * 24) * (this.rand() < 0.5 ? 1 : -1),
        width: r * this.unit,
        arc: ARC_MIN + this.rand() * (ARC_MAX - ARC_MIN),
        follow: FOLLOW_MIN + this.rand() * (FOLLOW_MAX - FOLLOW_MIN),
        lamVel: 0.5 + this.rand() * 0.6,
        // The official widens the orbit by 2.5 design units a second.
        radVel: this.rand() * 2.5 * this.unit,
        // How far the orbit has widened so far.
        grow: 0,
      });
    }
    return out;
  }

  /**
   * A point on the particle's orbit.
   *
   * The hoop is not a flat ring drawn on the screen: it is a ring in three
   * dimensions, tipped out of the screen, and the picture shows it foreshortened
   * into an ellipse. The official does the same, and it is what makes the paint
   * read as a cage: the hoop's near side comes towards the viewer and its far
   * side goes away, so the ring crosses the character's face along its top and
   * passes behind it along its bottom.
   *
   * The hoop's radius is the belt's radius: half of the shape's widest row, so
   * the ring stands off the body's widest dimension. The tilt is the same for
   * every point of the hoop, and the roll is what tells the lane sets apart.
   * The tilt also squashes the hoop's depth axis, so what the camera sees is a
   * flat ellipse and the band reads as a shallow streak sweeping across the
   * body rather than a ring drawn around it.
   */
  private orbit(spec: Spec, lam: number): { x: number; y: number; z: number } {
    // The hoop's own plane: `a` runs along the hoop, `i` is how far the point
    // is out of the screen, and the tilt is what tips the hoop out of it.
    const a = Math.sin(lam);
    const i = -Math.cos(lam) * Math.sin(spec.tilt);
    const cr = Math.cos(spec.roll);
    const sr = Math.sin(spec.roll);
    const r = this.belt * ORBIT + spec.lane * spec.laneStep + spec.grow;
    return {
      x: this.cx + r * (a * cr - i * sr),
      y: this.cy + r * (a * sr + i * cr),
      z: Math.cos(lam) * Math.cos(spec.tilt),
    };
  }

  private spawn(spec: Spec, spin: BandSpin, dir: number) {
    const back = document.createElementNS(NS, "path");
    const front = document.createElementNS(NS, "path");
    const grad = document.createElementNS(NS, "linearGradient");
    const id = `paint-grad-${this.counter++}`;
    grad.setAttribute("id", id);
    grad.setAttribute("gradientUnits", "userSpaceOnUse");
    const stops: SVGStopElement[] = [];
    for (let i = 0; i < 5; i++) {
      const stop = document.createElementNS(NS, "stop");
      stop.setAttribute("offset", String(i / 4));
      grad.appendChild(stop);
      stops.push(stop);
    }
    for (const path of [back, front]) {
      path.setAttribute("fill", `url(#${id})`);
      path.setAttribute("stroke", "none");
      path.setAttribute("data-trail", "");
    }
    this.defs?.appendChild(grad);
    this.back?.appendChild(back);
    this.front?.appendChild(front);
    // The particle starts where the head is, a little behind it, and drifts on.
    const lam = spin.angle - this.rand() * 0.18;
    this.strokes.push({
      spec: { ...spec, lamVel: spec.lamVel * dir },
      lam,
      carry: 0,
      life: 0,
      ret: 0,
      hist: [],
      back,
      front,
      grad,
      stops,
      written: NaN,
    });
  }

  /**
   * The paint keeps the avatar's view, so a dragged avatar drags its paint
   * with it.
   *
   * The official's belt hangs in the world while the bot turns inside it, and
   * that is what makes the belt read: the paint stays put and the shape turns
   * under it. The body turns in depth, on a layer inside the view, so the view
   * the paint copies carries no part of that turn.
   */
  private copyView(host: HTMLElement | null) {
    if (!host) return;
    const el = this.view && host.contains(this.view) ? this.view : host.querySelector<HTMLElement>("[data-view]");
    this.view = el;
    if (!el) return;
    const t = el.style.transform;
    if (t === this.lastTransform) return;
    this.lastTransform = t;
    if (this.back) this.back.style.transform = t;
    if (this.front) this.front.style.transform = t;
  }

  step(dt: number, spin: BandSpin, host: HTMLElement | null, mode: BandMode | null) {
    this.now += dt;
    this.sync(host);

    // The paint is driven by the turn alone, as on the official: the state
    // does not change it, the turn is the signal the paint rides. The state
    // only picks the plan the turn is drawn with.
    const turning = Math.abs(spin.rate) >= REST_RATE;
    if (!this.spinning && turning) {
      // The celebration runs the official's wide plan, the working turn its
      // narrow one.
      this.plan = this.makePlan(mode === "done");
      this.spinning = true;
      this.armed = true;
      this.queue = [];
    } else if (this.spinning && !turning) {
      // The turn stopped: the strokes that have not started yet are dropped.
      this.queue = [];
      this.spinning = false;
    }
    // The paint only lets the strokes out once the turn is quick.
    if (this.armed && Math.abs(spin.rate) >= SPAWN_RATE) {
      this.armed = false;
      // The official lets the strokes out one after another, each a random
      // fifty-five to a hundred and five milliseconds later than the one
      // before it.
      this.queue = [];
      for (let i = 0; i < this.plan.length; i++) {
        this.queue.push({ spec: this.plan[i], at: this.now + i * (0.055 + this.rand() * 0.05) });
      }
    }
    while (this.queue.length && this.now >= this.queue[0].at) {
      const next = this.queue.shift();
      if (next) this.spawn(next.spec, spin, Math.sign(spin.rate) || 1);
    }

    for (let i = this.strokes.length - 1; i >= 0; i--) {
      const s = this.strokes[i];
      s.life += dt;
      const age = clamp(s.life / LIFE, 0, 1);
      // The stroke draws back in when the bot rests, and again when it gets old.
      const back = !turning || age > 0.55;
      s.ret = clamp(s.ret + (back ? dt / 0.5 : -dt / 0.35), 0, 1);
      if (s.ret >= 1) {
        s.back.remove();
        s.front.remove();
        s.grad.remove();
        this.strokes.splice(i, 1);
        continue;
      }
      // The orbit: the very turn that moves the face moves the paint.
      if (turning) {
        s.carry = spin.rate * s.spec.follow;
        s.lam += spin.rate * dt * s.spec.follow + s.spec.lamVel * dt;
      } else {
        s.lam += (s.carry + s.spec.lamVel) * dt;
        s.carry *= Math.exp(-2.6 * dt);
        s.spec.lamVel *= Math.exp(-2.6 * dt);
      }
      s.spec.grow += s.spec.radVel * dt;
      this.draw(s);
    }
  }

  /** The wake as a tapering ribbon, split into the parts in front of and behind the body. */
  private draw(s: Stroke) {
    const spec = s.spec;
    const hist = s.hist;
    const last = hist.length ? hist[hist.length - 1].l : s.lam;
    const delta = s.lam - last;
    const n = Math.min(Math.ceil(Math.abs(delta) / SAMPLE), SAMPLE_MAX);
    for (let i = 1; i <= n; i++) {
      const l = last + (delta * i) / n;
      const p = this.orbit(spec, l);
      hist.push({ x: p.x, y: p.y, l, z: p.z });
    }
    if (!hist.length) {
      const p = this.orbit(spec, s.lam);
      hist.push({ x: p.x, y: p.y, l: s.lam, z: p.z });
    }
    // The wake keeps a fixed length: the oldest point is pulled to the edge.
    const arc = spec.arc * (1 - s.ret * s.ret * (3 - 2 * s.ret));
    while (hist.length > 2 && Math.abs(s.lam - hist[0].l) > arc) hist.shift();
    const over = Math.abs(s.lam - hist[0].l) - arc;
    if (hist.length >= 2 && over > 0) {
      const l = hist[0].l + Math.sign(s.lam - hist[0].l) * over;
      const p = this.orbit(spec, l);
      hist[0] = { x: p.x, y: p.y, l, z: p.z };
    }
    if (hist.length > HISTORY) hist.splice(0, hist.length - HISTORY);

    // The ribbon is widest where it is nearest the viewer and narrowest where
    // it slips behind the body, the way the official's brush behaves.
    const near = hist.length ? hist[hist.length - 1].z : 0;
    const depth = 0.72 + 0.28 * clamp(near, 0, 1);
    const grow = smooth(Math.min(s.life / 0.34, 1));
    const width = Math.max(spec.width * depth * 1.7 * this.sizeScale * grow * (1 - 0.72 * s.ret * s.ret), 0.5);

    const { front, back } = this.ribbon(hist, width);
    s.back.setAttribute("d", back);
    s.front.setAttribute("d", front);
    const opacity = Math.min(1, s.life / 0.26);
    s.back.setAttribute("opacity", opacity.toFixed(3));
    s.front.setAttribute("opacity", opacity.toFixed(3));

    // The colour drifts along the ribbon and with the stroke's age.
    const hue = spec.hue + spec.hueVel * s.life;
    if (!(Math.abs(hue - s.written) < 0.75)) {
      s.written = hue;
      for (let i = 0; i < s.stops.length; i++) {
        const t = i / (s.stops.length - 1);
        const h = ((hue + spec.hueSpan * t) % 360 + 360) % 360;
        s.stops[i].setAttribute("stop-color", `hsl(${Math.round(h)} 56% ${Math.round(56 + 11 * t)}%)`);
      }
    }
    const tail = hist[0];
    const head = hist[hist.length - 1];
    s.grad.setAttribute("x1", String(round(tail.x)));
    s.grad.setAttribute("y1", String(round(tail.y)));
    s.grad.setAttribute("x2", String(round(head.x)));
    s.grad.setAttribute("y2", String(round(head.y)));
  }

  /** The wake as a tapering ribbon, split into the parts in front of and behind the body. */
  private ribbon(hist: Point3[], width: number): { front: string; back: string } {
    const n = hist.length;
    if (n < 2) return { front: "", back: "" };
    let len = 0;
    for (let i = 1; i < n; i++) len += Math.hypot(hist[i].x - hist[i - 1].x, hist[i].y - hist[i - 1].y);
    // The ribbon never grows wider than a third of its own length.
    const cap = Math.min(width, 0.34 * len);
    const nx: number[] = [];
    const ny: number[] = [];
    for (let i = 0; i < n; i++) {
      const prev = hist[Math.max(0, i - 1)];
      const next = hist[Math.min(n - 1, i + 1)];
      let tx = next.x - prev.x;
      let ty = next.y - prev.y;
      const l = Math.hypot(tx, ty) || 1;
      tx /= l;
      ty /= l;
      const h = (cap * (0.5 + (i / (n - 1)) * 0.5)) / 2;
      nx.push(-ty * h);
      ny.push(tx * h);
    }
    // Runs of the wake that are in front of the body, and runs that are behind it.
    let front = "";
    let back = "";
    let i = 0;
    while (i < n) {
      const isFront = hist[i].z >= 0;
      let j = i;
      while (j + 1 < n && (hist[j + 1].z >= 0) === isFront) j++;
      const a = Math.max(i - 1, 0);
      const b = Math.min(j + 1, n - 1);
      if (b > a) {
        const d = this.run(hist, nx, ny, a, b);
        if (isFront) front += d;
        else back += d;
      }
      i = j + 1;
    }
    return { front, back };
  }

  /** A closed ribbon between two samples, with a round cap at the open ends. */
  private run(hist: Point3[], nx: number[], ny: number[], from: number, to: number): string {
    let d = "";
    for (let i = from; i <= to; i++) {
      d += `${i === from ? "M" : "L"}${round(hist[i].x + nx[i])} ${round(hist[i].y + ny[i])}`;
    }
    d += to === hist.length - 1 ? this.cap(nx[to], ny[to]) : "L";
    for (let i = to; i >= from; i--) {
      d += `${i === to ? "" : "L"}${round(hist[i].x - nx[i])} ${round(hist[i].y - ny[i])}`;
    }
    if (from === 0) d += `${this.cap(nx[0], ny[0])}${round(hist[0].x + nx[0])} ${round(hist[0].y + ny[0])}`;
    return `${d}Z`;
  }

  private cap(nx: number, ny: number): string {
    const r = Math.max(Math.hypot(nx, ny), 0.2);
    return `A${round(r)} ${round(r)} 0 0 0 `;
  }
}

// ---------------------------------------------------------------------------
// The component

export interface BandProps {
  definition: AvatarDefinition;
  /** The avatar's host element: the band copies its view transform, so both turn together. */
  hostRef: RefObject<HTMLDivElement | null>;
}

export const Band = forwardRef<BandHandle, BandProps>(function Band({ definition, hostRef }, ref) {
  const backRef = useRef<SVGSVGElement | null>(null);
  const frontRef = useRef<SVGSVGElement | null>(null);
  const defsRef = useRef<SVGSVGElement | null>(null);
  const paint = useMemo(() => new Paint(), []);
  const clock = useMemo(() => new SpinClock(), []);

  useEffect(() => {
    paint.attach(definition, backRef.current, frontRef.current, defsRef.current);
  }, [definition, paint]);

  /**
   * The paint's box follows the avatar's, without waiting for a frame: the
   * page's animation loop sleeps while nothing moves, and a sleeping loop
   * cannot notice that the layout changed under it.
   */
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let scene: HTMLElement | null = null;
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => sync());
    function sync() {
      paint.sync(hostRef.current);
      const el = hostRef.current?.querySelector<HTMLElement>("[data-avatar-scene]") ?? null;
      if (el && el !== scene) {
        scene = el;
        resize?.observe(el);
      }
    }
    resize?.observe(host);
    // The scene is mounted into the host after this effect, so watch for it.
    const mutation = typeof MutationObserver === 'undefined' ? null : new MutationObserver(sync);
    mutation?.observe(host, { childList: true });
    sync();
    return () => {
      resize?.disconnect();
      mutation?.disconnect();
    };
  }, [paint, hostRef]);

  useImperativeHandle(ref, () => ({
    step(dt, mode) {
      const spin = clock.step(dt, mode);
      paint.step(dt, spin, hostRef.current, mode);
      return { ...spin, painting: paint.painting };
    },
  }), [clock, paint, hostRef]);

  return (
    <>
      <svg ref={defsRef} className="paint-defs" aria-hidden="true" focusable="false" />
      <svg ref={backRef} className="paint-back" viewBox="0 0 100 100" aria-hidden="true" focusable="false" />
      <svg ref={frontRef} className="paint-front" viewBox="0 0 100 100" aria-hidden="true" focusable="false" />
    </>
  );
});
