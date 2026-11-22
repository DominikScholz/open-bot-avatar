/*
 * How the editor picks the avatar's state and mood: the state as a row of pills under the
 * preview, the mood as a toggle of eyes in the preview's corner.
 */
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { BASE_PITCH, BASE_YAW, type AvatarDefinition, type AvatarMood, type AvatarState } from "open-bot-avatar";
import type { AvatarMaterial } from "open-bot-avatar/dom";
import { BotAvatar } from "../BotAvatar";
import type { Choice } from "./ui";

export const STATES: Choice<AvatarState>[] = [
  { value: "idle", label: "Idle", hint: "Calm, looking around" },
  { value: "thinking", label: "Thinking", hint: "Three dots, taking turns" },
  { value: "working", label: "Working", hint: "Busy, with ribbons sweeping round" },
  { value: "waiting", label: "Waiting", hint: "Leaning, eyes flat" },
  { value: "blocked", label: "Blocked", hint: "An exclamation mark" },
  { value: "done", label: "Done", hint: "Spins inside a cage of ribbons, then rests" },
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

const MATERIALS: Choice<AvatarMaterial>[] = [
  { value: "flat", label: "Flat", hint: "Solid color" },
  { value: "plush", label: "Plush", hint: "Brushed fur" },
];

const FRONT = { yaw: -BASE_YAW, pitch: -BASE_PITCH };

export function MaterialToggle({ coat, onCoat, definition, color }: {
  coat: AvatarMaterial;
  onCoat: (coat: AvatarMaterial) => void;
  definition: AvatarDefinition;
  color: string;
}) {
  // Both swatches frame the same eye and cheek, even on off-center faces.
  const { x, y, spacing, scale } = definition.eyes;
  const zoom = 1.1 / scale;
  const left = 4 - (x + spacing / 2) * zoom;
  const top = 7 - y * zoom;
  return (
    <RadioGroup label="Material" value={coat} options={MATERIALS} onChange={onCoat} className="face-segmented" itemClassName="face-option material-option"
      render={({ value, label }) => (
        <>
          <span className="material-sample" aria-hidden="true">
            <BotAvatar definition={definition} color={color} material={value} view={FRONT} still label=""
              size={100 * zoom} className="avatar-view" style={{ position: "absolute", left, top }} />
          </span>
          {label}
        </>
      )}
    />
  );
}

export function FaceToggle({ mood, onMood }: { mood: AvatarMood; onMood: (mood: AvatarMood) => void }) {
  return <RadioGroup label="Mood" value={mood} options={MOODS} onChange={onMood} className="face-segmented" itemClassName="face-option" iconOnly render={(o) => <Eyes mood={o.value} />} />;
}
