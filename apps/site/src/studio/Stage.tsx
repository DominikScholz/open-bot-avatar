import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import type { AvatarDefinition, AvatarMood, AvatarState } from "open-bot-avatar";
import { BotAvatar } from "../BotAvatar";
import { Icon } from "./ui";
import { FaceToggle, MOODS, STATES, StatePills } from "./pickers";

export type ViewAngle = { yaw: number; pitch: number };

interface StageProps {
  definition: AvatarDefinition;
  color: string;
  state: AvatarState;
  mood: AvatarMood;
  followCursor: boolean;
  /** Forced on or off, or "system" to follow prefers-reduced-motion. */
  reducedMotion: boolean | "system";
  /** Whether motion is reduced right now (resolved), for the reset easing. */
  reduced: boolean;
  view: ViewAngle;
  onView: (view: ViewAngle) => void;
  onState: (state: AvatarState) => void;
  onMood: (mood: AvatarMood) => void;
  /** Shown under the state and mood (the avatar's actions). */
  children?: ReactNode;
}

const PITCH_LIMIT = 0.9;
const clampPitch = (p: number) => Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, p));
/** Keep yaw in -π..π so a reset never spins the long way round. */
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export function Stage({ definition, color, state, mood, followCursor, reducedMotion, reduced, view, onView, onState, onMood, children }: StageProps) {
  const drag = useRef<{ id: number; x: number; y: number; start: ViewAngle } | null>(null);
  const [dragging, setDragging] = useState(false);
  const easing = useRef(0);
  const turned = Math.abs(view.yaw) > 0.01 || Math.abs(view.pitch) > 0.01;

  useEffect(() => () => cancelAnimationFrame(easing.current), []);

  // What a key on the preview just picked, for screen readers.
  const [said, setSaid] = useState("");

  const reset = () => {
    cancelAnimationFrame(easing.current);
    if (reduced) return onView({ yaw: 0, pitch: 0 });
    const from = { yaw: wrap(view.yaw), pitch: view.pitch };
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 420);
      const k = 1 - (1 - t) ** 3;
      onView({ yaw: from.yaw * (1 - k), pitch: from.pitch * (1 - k) });
      if (t < 1) easing.current = requestAnimationFrame(step);
    };
    easing.current = requestAnimationFrame(step);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    cancelAnimationFrame(easing.current);
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, start: view };
    setDragging(true);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const next = {
      yaw: d.start.yaw + (e.clientX - d.x) * 0.011,
      pitch: clampPitch(d.start.pitch - (e.clientY - d.y) * 0.009),
    };
    onView(next);
  };
  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    setDragging(false);
    onView({ yaw: wrap(view.yaw), pitch: view.pitch });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // 1–6 pick a state, M (Shift+M backwards) the next mood.
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      const pick = /^[1-9]$/.test(e.key) ? STATES[Number(e.key) - 1] : undefined;
      if (pick) {
        e.preventDefault();
        onState(pick.value);
        setSaid(pick.label);
        return;
      }
      if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        const at = MOODS.findIndex((m) => m.value === mood);
        const next = MOODS[(at + (e.shiftKey ? -1 : 1) + MOODS.length) % MOODS.length];
        onMood(next.value);
        setSaid(`${next.label} mood`);
        return;
      }
    }
    const step = e.shiftKey ? 0.6 : 0.2;
    const moves: Record<string, ViewAngle> = {
      ArrowLeft: { yaw: view.yaw - step, pitch: view.pitch },
      ArrowRight: { yaw: view.yaw + step, pitch: view.pitch },
      ArrowUp: { yaw: view.yaw, pitch: clampPitch(view.pitch + step) },
      ArrowDown: { yaw: view.yaw, pitch: clampPitch(view.pitch - step) },
    };
    if (e.key === "Home" || e.key === "0" || e.key === "Escape") {
      if (!turned) return;
      e.preventDefault();
      return reset();
    }
    const next = moves[e.key];
    if (!next) return;
    e.preventDefault();
    cancelAnimationFrame(easing.current);
    onView({ yaw: wrap(next.yaw), pitch: next.pitch });
  };

  const preview = (
    <div
      className={dragging ? "stage-view is-dragging" : "stage-view"}
      tabIndex={0}
      role="group"
      aria-roledescription="3D preview"
      aria-label={`${definition.name}. Drag or use arrow keys to turn; Home resets the view; 1 to 6 pick a state; M changes the mood.`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={reset}
      onKeyDown={onKeyDown}
    >
      <BotAvatar
        className="avatar-view stage-avatar"
        definition={definition}
        color={color}
        state={state}
        mood={mood}
        view={view}
        followPointer={followCursor}
        holdGaze={dragging}
        reducedMotion={reducedMotion}
        label=""
      />
      <FaceToggle mood={mood} onMood={onMood} />
      <button
        type="button"
        className="stage-reset"
        onClick={reset}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label="Reset view"
        title="Reset view"
        hidden={!turned}
        tabIndex={turned ? 0 : -1}
      >
        <Icon name="rotate" />
      </button>
    </div>
  );

  return (
    <section className="stage" aria-label={`${definition.name} preview`}>
      {/* The avatar's name, for screen readers only: the picker shows which one it is. */}
      <h1 className="sr-only">{definition.name}</h1>
      {preview}
      <div className="stage-picks">
        <StatePills state={state} onState={onState} />
      </div>
      {children}
      <span className="sr-only" role="status">
        {said}
      </span>
    </section>
  );
}
