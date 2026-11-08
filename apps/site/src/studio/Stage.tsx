import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { type AvatarDefinition, type AvatarMotion } from "open-bot-avatar";
import { subscribeFrames, type MountedAvatar } from "open-bot-avatar/dom";
import { BotAvatar } from "../BotAvatar";
import { Band, type BandHandle, type BandMode } from "./Band";
import { StatusGlyph } from "./Lifecycle";
import { LIFECYCLE_STATES } from "./states";
import { Icon } from "./ui";

export type ViewAngle = { yaw: number; pitch: number };

interface StageProps {
  definition: AvatarDefinition;
  color: string;
  mood: AvatarMotion;
  followCursor: boolean;
  /** Forced on or off, or "system" to follow prefers-reduced-motion. */
  reducedMotion: boolean | "system";
  /** Whether motion is reduced right now (resolved), for the reset easing. */
  reduced: boolean;
  view: ViewAngle;
  onView: (view: ViewAngle) => void;
  onMotion: (motion: AvatarMotion) => void;
  /** Shown under the moods (the avatar's actions). */
  children?: ReactNode;
}

const PITCH_LIMIT = 0.9;
const clampPitch = (p: number) => Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, p));
/** Keep yaw in -π..π so a reset never spins the long way round. */
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export function Stage({ definition, color, mood, followCursor, reducedMotion, reduced, view, onView, onMotion, children }: StageProps) {
  const drag = useRef<{ id: number; x: number; y: number; start: ViewAngle } | null>(null);
  const [dragging, setDragging] = useState(false);
  const easing = useRef(0);
  const turned = Math.abs(view.yaw) > 0.01 || Math.abs(view.pitch) > 0.01;
  const band = useRef<BandHandle>(null);
  const host = useRef<HTMLDivElement | null>(null);
  const avatar = useRef<MountedAvatar | null>(null);
  const faceTurn = useRef(0);
  const bodyTurn = useRef(0);
  const faceWhirl = useRef(0);

  useEffect(() => () => cancelAnimationFrame(easing.current), []);

  /**
   * One clock for the paint and the avatar: the band is a particle system whose
   * orbits advance with the very spin that turns the face, so both move together.
   */
  useEffect(() => {
    let last = -1;
    const unsubscribe = subscribeFrames({
      draw: (time) => {
        const dt = last < 0 ? 0 : Math.min(0.05, time - last);
        last = time;
        const mode: BandMode | null = reduced
          ? null
          : mood === "working"
            ? "working"
            : mood === "done"
              ? "done"
              : null;
        const state = band.current?.step(dt, mode);
        if (!state) return false;
        // The face turns with the turn, and the turn outlives the state that
        // started it: the band finishes its sweep before the bot settles.
        if (state.face !== faceTurn.current || state.bodyTurn !== bodyTurn.current || state.whirl !== faceWhirl.current) {
          faceTurn.current = state.face;
          bodyTurn.current = state.bodyTurn;
          faceWhirl.current = state.whirl;
          avatar.current?.update({ faceTurn: state.face, bodyTurn: state.bodyTurn, faceWhirl: state.whirl });
        }
        if (!mode) {
          // The band that is still drawing back in needs its frames.
          return state.painting;
        }
        return true;
      },
    });
    return unsubscribe;
  }, [mood, reduced]);

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

  return (
    <section className="stage" aria-label={`${definition.name} preview`}>
      {/* The avatar's name, for screen readers only: the picker shows which one it is. */}
      <h1 className="sr-only">{definition.name}</h1>
      <div
        className={dragging ? "stage-view is-dragging" : "stage-view"}
        tabIndex={0}
        role="group"
        aria-roledescription="3D preview"
        aria-label={`${definition.name}. Drag or use arrow keys to turn; Home resets the view.`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={reset}
        onKeyDown={onKeyDown}
      >
        {mood === "blocked" || mood === "thinking" ? (
          <StatusGlyph kind={mood} color={color} reducedMotion={reduced} />
        ) : (
          <div className="stage-figure">
            <div className="stage-box">
              {/* The paint: behind the body, and in front of it. */}
              <Band ref={band} definition={definition} hostRef={host} />
              <div className="stage-body">
                <BotAvatar
                  hostRef={host}
                  onMount={(mounted) => {
                    avatar.current = mounted;
                  }}
                  className="avatar-view stage-avatar"
                  definition={definition}
                  color={color}
                  mood={mood}
                  view={view}
                  followPointer={followCursor}
                  holdGaze={dragging}
                  reducedMotion={reducedMotion}
                  label=""
                />
              </div>
            </div>
          </div>
        )}
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
      <div className="moods" role="radiogroup" aria-label="State">
        {LIFECYCLE_STATES.map((m) => (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={mood === m.value}
            className={mood === m.value ? "mood is-on" : "mood"}
            onClick={() => onMotion(m.value)}
          >
            {m.label}
          </button>
        ))}
      </div>
      {children}
    </section>
  );
}
