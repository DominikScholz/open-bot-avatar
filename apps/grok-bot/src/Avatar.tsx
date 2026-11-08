import { useId } from 'react';
import { SHAPES } from './data';
import type { Bot, BotState } from './data';

/** Long paint ribbons, in a 0–100 box that is scaled onto the 259 avatar frame. */
const RIBBONS = [
  { d: 'M6 42C24 16 72 8 96 30', width: 3.6, hue: 148, x1: 6, y1: 42, x2: 96, y2: 30, delay: 0 },
  { d: 'M8 40C30 56 54 76 90 86', width: 2.9, hue: 262, x1: 8, y1: 40, x2: 90, y2: 86, delay: 0.18 },
  { d: 'M26 24C4 30 2 62 22 78C34 88 46 80 54 70', width: 3.2, hue: 320, x1: 26, y1: 24, x2: 54, y2: 70, delay: 0.36 },
  { d: 'M66 18C94 22 102 52 86 74C76 88 58 92 48 84', width: 3.5, hue: 8, x1: 66, y1: 18, x2: 48, y2: 84, delay: 0.54 },
  { d: 'M20 84C36 100 74 100 92 82', width: 3, hue: 36, x1: 20, y1: 84, x2: 92, y2: 82, delay: 0.72 },
  { d: 'M10 68C34 60 58 62 86 52', width: 2.5, hue: 292, x1: 10, y1: 68, x2: 86, y2: 52, delay: 0.9 },
  { d: 'M40 20C50 10 68 10 80 20', width: 2.3, hue: 178, x1: 40, y1: 20, x2: 80, y2: 20, delay: 1.08 },
  { d: 'M90 58C104 62 106 78 92 84', width: 2.5, hue: 214, x1: 90, y1: 58, x2: 92, y2: 84, delay: 1.26 },
] as const;

function Ribbon({ index, ribbon }: { index: number; ribbon: (typeof RIBBONS)[number] }) {
  const rawId = useId();
  const id = `oba-done-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}-${index}`;
  return (
    <>
      <defs>
        <linearGradient
          id={id}
          gradientUnits="userSpaceOnUse"
          x1={ribbon.x1}
          y1={ribbon.y1}
          x2={ribbon.x2}
          y2={ribbon.y2}
        >
          {Array.from({ length: 5 }, (_, stop) => (
            <stop
              key={stop}
              offset={stop / 4}
              stopColor={`hsl(${ribbon.hue - stop * 17.5} 56% ${56 + stop * 2.75}%)`}
            />
          ))}
        </linearGradient>
      </defs>
      <path
        className="done-ribbon"
        d={ribbon.d}
        pathLength={1}
        fill="none"
        stroke={`url(#${id})`}
        strokeWidth={ribbon.width}
        strokeLinecap="round"
        style={{ animationDelay: `${ribbon.delay}s` }}
      />
    </>
  );
}

interface AvatarProps {
  bot: Bot;
  state: BotState;
  className?: string;
  label?: string;
  showTrails?: boolean;
}

export function Avatar({ bot, state, className, label, showTrails = true }: AvatarProps) {
  const rawId = useId();
  const maskId = `oba-mask-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const shape = SHAPES[bot.shape];
  const eye = bot.eyes;
  const left = 114 - eye.spacing / 2;
  const right = 114 + eye.spacing / 2;
  const glyph = state === 'blocked' || state === 'thinking';

  return (
    <div
      className={`avatar s-${state}${className ? ` ${className}` : ''}`}
      style={{ color: bot.color }}
      data-state={state}
      role="img"
      aria-label={label ?? `${bot.name}, ${state}`}
    >
      <svg viewBox="-15 -15 259 259" aria-hidden="true" focusable="false">
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse" x="-15" y="-15" width="259" height="259">
            <path d={shape} fill="#fff" />
            <g className="eye-gaze">
              <g transform={`rotate(${eye.rot} 114 ${eye.y})`}>
                <g className="eye-scale">
                  <g className="eye-blink">
                    <rect x={left - eye.w / 2} y={eye.y - eye.h / 2} width={eye.w} height={eye.h} rx={eye.w / 2} fill="#000" />
                  </g>
                </g>
                <g className="eye-scale">
                  <g className="eye-blink">
                    <rect x={right - eye.w / 2} y={eye.y - eye.h / 2} width={eye.w} height={eye.h} rx={eye.w / 2} fill="#000" />
                  </g>
                </g>
              </g>
            </g>
          </mask>
        </defs>

        <g className={`body-layer${glyph ? ' is-hidden' : ''}`}>
          <g className="body-motion">
            <rect x="-15" y="-15" width="259" height="259" fill="currentColor" mask={`url(#${maskId})`} />
          </g>
        </g>

        <g className="glyph-layer glyph-blocked" aria-hidden="true">
          <path
            className="alert-bar"
            d="M99.2705 81.2705A15 15 0 0 1 129.2705 81.2705L122.7705 153.7705A8.5 8.5 0 0 1 105.7705 153.7705Z"
            fill="currentColor"
          />
          <circle className="alert-dot" cx="114.2705" cy="177" r="11" fill="currentColor" />
        </g>

        <g className="glyph-layer glyph-thinking" aria-hidden="true">
          <circle className="think-dot" cx="52.27" cy="112" r="23" fill="currentColor" opacity={0.55} />
          <circle className="think-dot" cx="114.27" cy="112" r="23" fill="currentColor" opacity={1} />
          <circle className="think-dot" cx="176.27" cy="112" r="23" fill="currentColor" opacity={0.7} />
        </g>

        {state === 'done' && showTrails && (
          <g className="done-ribbons" transform="scale(2.28)" aria-hidden="true">
            {RIBBONS.map((ribbon, i) => (
              <Ribbon key={i} index={i} ribbon={ribbon} />
            ))}
          </g>
        )}
      </svg>
    </div>
  );
}
