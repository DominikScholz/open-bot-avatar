/*
 * PROTOTYPE: ways to pick the avatar's state and mood, switchable with ?picker= or the
 * "Picker prototype" control in the corner. Once one is chosen, keep it and drop the rest.
 */
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { AvatarDefinition, AvatarMood, AvatarState } from "open-bot-avatar";
import { BotAvatar } from "../BotAvatar";
import { Segmented, usePopover, type Choice } from "./ui";

export const STATES: Choice<AvatarState>[] = [
  { value: "idle", label: "Idle", hint: "Calm, looking around" },
  { value: "thinking", label: "Thinking", hint: "Three dots, taking turns" },
  { value: "working", label: "Working", hint: "Busy, with ribbons circling" },
  { value: "waiting", label: "Waiting", hint: "Leaning, eyes flat" },
  { value: "blocked", label: "Blocked", hint: "An exclamation mark" },
  { value: "done", label: "Done", hint: "Spins with ribbons, then rests" },
];

export const MOODS: Choice<AvatarMood>[] = [
  { value: "neutral", label: "Neutral", hint: "Plain eyes" },
  { value: "happy", label: "Happy", hint: "Smiling arcs; hops when idle" },
];

/** States that hide the body (dots, "!"), so a mood can't be seen on them. */
const FACELESS: ReadonlySet<AvatarState> = new Set(["thinking", "blocked"]);

/** The state to show a mood on: this one, or idle where the body is hidden. */
export const moodPreviewState = (state: AvatarState): AvatarState => (FACELESS.has(state) ? "idle" : state);

/* The prototype switch */

export type PickerVariant = "menus" | "pills" | "columns" | "face" | "matrix";

const VARIANTS: { value: PickerVariant; label: string }[] = [
  { value: "menus", label: "Menus" },
  { value: "pills", label: "Pills" },
  { value: "columns", label: "Columns" },
  { value: "face", label: "Face" },
  { value: "matrix", label: "Matrix" },
];

const isVariant = (v: unknown): v is PickerVariant => VARIANTS.some((x) => x.value === v);
const STORE = "open-bot-avatar.picker-prototype";

// Read when this module loads: the studio clears the page's query once it has applied a link.
const fromUrl = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("picker");

function initialVariant(): PickerVariant {
  if (isVariant(fromUrl)) return fromUrl;
  try {
    const stored = window.localStorage.getItem(STORE);
    if (isVariant(stored)) return stored;
  } catch {
    // Storage may be blocked; the default will do.
  }
  return "menus";
}

export function usePickerVariant() {
  const [variant, setVariant] = useState<PickerVariant>(initialVariant);
  const choose = (next: PickerVariant) => {
    setVariant(next);
    try {
      window.localStorage.setItem(STORE, next);
    } catch {
      // Not remembered, then.
    }
    const url = new URL(window.location.href);
    url.searchParams.set("picker", next);
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  };
  return [variant, choose] as const;
}

export function PickerSwitch({ value, onChange }: { value: PickerVariant; onChange: (v: PickerVariant) => void }) {
  const [open, setOpen] = useState(true);
  return (
    <div className={open ? "proto-switch" : "proto-switch is-collapsed"}>
      <button type="button" className="proto-label" aria-expanded={open} onClick={() => setOpen(!open)}>
        Picker prototype {open ? "–" : "+"}
      </button>
      {open ? <Segmented size="sm" label="Picker prototype" value={value} options={VARIANTS} onChange={onChange} /> : null}
    </div>
  );
}

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, [query]);
  return matches;
}

/* A radio group: one stop in the tab order, arrow keys (and Home/End) move the choice. */

interface RadioGroupProps<T extends string> {
  label: string;
  value: T;
  options: readonly Choice<T>[];
  onChange: (value: T) => void;
  className: string;
  itemClassName: string;
  /** The button's content; `live` is true for the choice that is picked, hovered or focused. */
  render?: (option: Choice<T>, live: boolean) => ReactNode;
  /** The content has no text: name each choice with an aria-label. */
  iconOnly?: boolean;
  /** Show each choice's hint as a tooltip. */
  tips?: boolean;
}

export function RadioGroup<T extends string>({ label, value, options, onChange, className, itemClassName, render, iconOnly, tips }: RadioGroupProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const [hovered, setHovered] = useState<T | null>(null);
  const [focused, setFocused] = useState<T | null>(null);
  const onKey = (event: KeyboardEvent, index: number) => {
    const last = options.length - 1;
    const moves: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowDown: index + 1,
      ArrowLeft: index - 1,
      ArrowUp: index - 1,
      Home: 0,
      End: last,
    };
    const to = moves[event.key];
    if (to === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    const next = (to + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div className={className} role="radiogroup" aria-label={label}>
      {options.map((option, index) => {
        const checked = option.value === value;
        const live = checked || hovered === option.value || focused === option.value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={iconOnly ? option.label : undefined}
            aria-description={option.hint}
            data-tip={tips ? option.hint : iconOnly ? option.label : undefined}
            tabIndex={checked ? 0 : -1}
            className={checked ? `${itemClassName} is-on` : itemClassName}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => onKey(event, index)}
            onPointerEnter={() => setHovered(option.value)}
            onPointerLeave={() => setHovered((h) => (h === option.value ? null : h))}
            onFocus={() => setFocused(option.value)}
            onBlur={() => setFocused((f) => (f === option.value ? null : f))}
          >
            {render ? render(option, live) : option.label}
          </button>
        );
      })}
    </div>
  );
}

/* What every picker needs to show the avatar. */
export interface Look {
  definition: AvatarDefinition;
  color: string;
  state: AvatarState;
  mood: AvatarMood;
  reducedMotion: boolean | "system";
  onState: (state: AvatarState) => void;
  onMood: (mood: AvatarMood) => void;
}

export function StatePills({ state, onState, className = "" }: Pick<Look, "state" | "onState"> & { className?: string }) {
  return <RadioGroup label="State" value={state} options={STATES} onChange={onState} className={`pills pills-states ${className}`} itemClassName="pill" tips />;
}

export function MoodPills({ mood, onMood }: Pick<Look, "mood" | "onMood">) {
  return (
    <div className="pills-row">
      <span className="pills-caption" aria-hidden="true">
        Mood
      </span>
      <RadioGroup label="Mood" value={mood} options={MOODS} onChange={onMood} className="pills pills-moods" itemClassName="pill" tips />
    </div>
  );
}

/* Columns: live mini avatars; only the picked, hovered or focused one moves. */

function Tile({ look, state, mood, live, label }: { look: Look; state: AvatarState; mood: AvatarMood; live: boolean; label: string }) {
  return (
    <>
      <span className="tile-avatar" aria-hidden="true">
        <BotAvatar className="avatar-view" definition={look.definition} color={look.color} state={state} mood={mood} reducedMotion={look.reducedMotion} still={!live} label="" />
      </span>
      <span className="tile-label">{label}</span>
    </>
  );
}

export function StateTiles({ look }: { look: Look }) {
  return (
    <div className="tiles-block tiles-block-states">
      <span className="tiles-caption" aria-hidden="true">
        State
      </span>
      <RadioGroup
        label="State"
        value={look.state}
        options={STATES}
        onChange={look.onState}
        className="tiles"
        itemClassName="tile"
        render={(o, live) => <Tile look={look} state={o.value} mood={look.mood} live={live} label={o.label} />}
      />
    </div>
  );
}

export function MoodTiles({ look }: { look: Look }) {
  const on = moodPreviewState(look.state);
  return (
    <div className="tiles-block tiles-block-moods">
      <span className="tiles-caption" aria-hidden="true">
        Mood
      </span>
      <RadioGroup
        label="Mood"
        value={look.mood}
        options={MOODS}
        onChange={look.onMood}
        className="tiles"
        itemClassName="tile"
        render={(o, live) => <Tile look={look} state={on} mood={o.value} live={live} label={o.label} />}
      />
    </div>
  );
}

/* Face: the mood as a small toggle of eyes, laid over a corner of the preview. */

function Eyes({ mood }: { mood: AvatarMood }) {
  return (
    <svg className="eyes-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {mood === "happy" ? (
        <path d="M4.5 15c.9-4.6 5.1-4.6 6 0M13.5 15c.9-4.6 5.1-4.6 6 0" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      ) : (
        <>
          <rect x="6" y="6.5" width="3.8" height="11" rx="1.9" fill="currentColor" />
          <rect x="14.2" y="6.5" width="3.8" height="11" rx="1.9" fill="currentColor" />
        </>
      )}
    </svg>
  );
}

export function FaceToggle({ mood, onMood }: Pick<Look, "mood" | "onMood">) {
  // Inside the preview: keep its drag, double-click reset and arrow-key turning out of this.
  return (
    <div className="face-toggle" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <RadioGroup label="Mood" value={mood} options={MOODS} onChange={onMood} className="face-segmented" itemClassName="face-option" iconOnly render={(o) => <Eyes mood={o.value} />} />
    </div>
  );
}

/* Matrix: every state in every mood, in a popover. */

export function MatrixButton({ look }: { look: Look }) {
  const { open, setOpen, root, trigger } = usePopover();
  const grid = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) (grid.current?.querySelector<HTMLButtonElement>(".matrix-cell.is-on") ?? grid.current?.querySelector<HTMLButtonElement>("button"))?.focus({ preventScroll: true });
  }, [open]);

  // Arrow keys move in two dimensions; a merged cell spans columns c0..c1.
  const onKey = (event: KeyboardEvent) => {
    const dir: Record<string, [number, number]> = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };
    const d = dir[event.key];
    if (!d) return;
    event.preventDefault();
    const cells = [...(grid.current?.querySelectorAll<HTMLButtonElement>("button[data-r]") ?? [])].map((el) => ({
      el,
      r: Number(el.dataset.r),
      c0: Number(el.dataset.c0),
      c1: Number(el.dataset.c1),
    }));
    const at = cells.find((c) => c.el === document.activeElement);
    if (!at) return;
    const target =
      d[0] !== 0
        ? cells.find((c) => c.r === at.r + d[0] && c.c0 <= at.c0 && at.c0 <= c.c1) ?? cells.find((c) => c.r === at.r + d[0])
        : cells.find((c) => c.r === at.r && (d[1] > 0 ? c.c0 === at.c1 + 1 : c.c1 === at.c0 - 1));
    target?.el.focus({ preventScroll: true });
  };

  const cols = MOODS.length;
  return (
    <div className="menu" ref={root}>
      <button ref={trigger} type="button" className="btn btn-sm" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}>
        All combinations
      </button>
      {open ? (
        <div className="popover popover-bottom matrix-popover" role="dialog" aria-label="All states and moods">
          <div ref={grid} className="matrix" style={{ gridTemplateColumns: `auto repeat(${cols}, minmax(0, 1fr))` }} onKeyDown={onKey}>
            <span />
            {MOODS.map((m, i) => (
              <button
                key={m.value}
                type="button"
                className={look.mood === m.value ? "matrix-head is-on" : "matrix-head"}
                aria-pressed={look.mood === m.value}
                data-r={0}
                data-c0={i + 1}
                data-c1={i + 1}
                onClick={() => look.onMood(m.value)}
              >
                {m.label}
              </button>
            ))}
            {STATES.map((s, row) => (
              <MatrixRow key={s.value} look={look} state={s} row={row + 1} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MatrixRow({ look, state, row }: { look: Look; state: Choice<AvatarState>; row: number }) {
  const cols = MOODS.length;
  const head = (
    <button
      type="button"
      className={look.state === state.value ? "matrix-head matrix-row-head is-on" : "matrix-head matrix-row-head"}
      aria-pressed={look.state === state.value}
      data-r={row}
      data-c0={0}
      data-c1={0}
      onClick={() => look.onState(state.value)}
    >
      {state.label}
    </button>
  );
  const mini = (mood: AvatarMood) => (
    <span className="matrix-avatar" aria-hidden="true">
      <BotAvatar className="avatar-view" definition={look.definition} color={look.color} state={state.value} mood={mood} reducedMotion={look.reducedMotion} still label="" />
    </span>
  );
  if (FACELESS.has(state.value)) {
    const on = look.state === state.value;
    return (
      <>
        {head}
        <button
          type="button"
          className={on ? "matrix-cell is-on" : "matrix-cell"}
          style={{ gridColumn: `span ${cols}` }}
          aria-pressed={on}
          aria-label={`${state.label} (looks the same in every mood)`}
          data-r={row}
          data-c0={1}
          data-c1={cols}
          onClick={() => look.onState(state.value)}
        >
          {mini(look.mood)}
        </button>
      </>
    );
  }
  return (
    <>
      {head}
      {MOODS.map((m, i) => {
        const on = look.state === state.value && look.mood === m.value;
        return (
          <button
            key={m.value}
            type="button"
            className={on ? "matrix-cell is-on" : "matrix-cell"}
            aria-pressed={on}
            aria-label={`${state.label}, ${m.label.toLowerCase()}`}
            data-r={row}
            data-c0={i + 1}
            data-c1={i + 1}
            onClick={() => {
              look.onState(state.value);
              look.onMood(m.value);
            }}
          >
            {mini(m.value)}
          </button>
        );
      })}
    </>
  );
}
