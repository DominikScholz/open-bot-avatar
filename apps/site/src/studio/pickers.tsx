/*
 * How the editor picks the avatar's state, mood and texture: the state as a row of pills under
 * the preview, the mood as a toggle of eyes in the preview's corner and the texture as a toggle
 * of a smooth and a fluffy blob under it.
 */
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { AvatarMood, AvatarState, AvatarTexture } from "open-bot-avatar";
import type { Choice } from "./ui";

export const STATES: Choice<AvatarState>[] = [
  { value: "idle", label: "Idle", hint: "Calm, looking around" },
  { value: "thinking", label: "Thinking", hint: "Three dots, taking turns" },
  { value: "working", label: "Working", hint: "Busy, with ribbons sweeping round" },
  { value: "waiting", label: "Waiting", hint: "Leaning, eyes flat" },
  { value: "blocked", label: "Blocked", hint: "An exclamation mark" },
  { value: "done", label: "Done", hint: "Spins inside a cage of ribbons, then rests" },
];

export const TEXTURES: Choice<AvatarTexture>[] = [
  { value: "smooth", label: "Smooth", hint: "A plain, smooth surface" },
  { value: "fluffy", label: "Fluffy", hint: "Soft tufts of fur that sway" },
];

export const MOODS: Choice<AvatarMood>[] = [
  { value: "neutral", label: "Neutral", hint: "Plain eyes" },
  { value: "happy", label: "Happy", hint: "Smiling arcs; hops when idle" },
];

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

function RadioGroup<T extends string>({ label, value, options, onChange, className, itemClassName, render, iconOnly, tips }: RadioGroupProps<T>) {
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

export function StatePills({ state, onState }: { state: AvatarState; onState: (state: AvatarState) => void }) {
  return <RadioGroup label="State" value={state} options={STATES} onChange={onState} className="pills pills-states" itemClassName="pill" tips />;
}

/* The mood as a small toggle of eyes, laid over a corner of the preview. */

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

export function FaceToggle({ mood, onMood }: { mood: AvatarMood; onMood: (mood: AvatarMood) => void }) {
  // Inside the preview: keep its drag, double-click reset and arrow-key turning out of this.
  return (
    <div className="face-toggle" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <RadioGroup label="Mood" value={mood} options={MOODS} onChange={onMood} className="face-segmented" itemClassName="face-option" iconOnly render={(o) => <Eyes mood={o.value} />} />
    </div>
  );
}

/* The texture as a second toggle under the mood: a smooth blob and a fluffy one. */

function Blob({ texture }: { texture: AvatarTexture }) {
  return (
    <svg className="eyes-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {texture === "fluffy" ? (
        <path
          d="M12 5.4A2.3 2.3 0 0 1 15.88 6.66A2.3 2.3 0 0 1 18.28 9.96A2.3 2.3 0 0 1 18.28 14.04A2.3 2.3 0 0 1 15.88 17.34A2.3 2.3 0 0 1 12 18.6A2.3 2.3 0 0 1 8.12 17.34A2.3 2.3 0 0 1 5.72 14.04A2.3 2.3 0 0 1 5.72 9.96A2.3 2.3 0 0 1 8.12 6.66A2.3 2.3 0 0 1 12 5.4Z"
          fill="currentColor"
        />
      ) : (
        <circle cx="12" cy="12" r="7" fill="currentColor" />
      )}
    </svg>
  );
}

export function TextureToggle({ texture, onTexture }: { texture: AvatarTexture; onTexture: (texture: AvatarTexture) => void }) {
  return (
    <div className="face-toggle texture-toggle" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <RadioGroup label="Texture" value={texture} options={TEXTURES} onChange={onTexture} className="face-segmented" itemClassName="face-option" iconOnly render={(o) => <Blob texture={o.value} />} />
    </div>
  );
}
