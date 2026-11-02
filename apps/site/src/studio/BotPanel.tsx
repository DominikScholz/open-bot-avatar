import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { AvatarDefinition } from "open-bot-avatar";
import { BotAvatar } from "../BotAvatar";
import { PALETTE, colorOf, defaultColor, type LookState } from "./look";
import { THUMB_LOOK, THUMB_VIEW, outlineSvg } from "./outline";
import { Icon } from "./ui";

export interface LibraryEntry {
  key: string;
  source: "starter" | "gallery" | "yours";
  definition: AvatarDefinition;
}

interface BotPanelProps {
  entries: LibraryEntry[];
  selected: LibraryEntry;
  look: LookState;
  /** The selected avatar's color. */
  color: string;
  onSelect: (key: string) => void;
  onColor: (color: string) => void;
  onNew: () => void;
}

/** #rgb as #rrggbb, which color inputs need. */
function fullHex(hex: string): string {
  return /^#[0-9a-f]{3}$/i.test(hex) ? `#${[...hex.slice(1)].map((c) => c + c).join("")}` : hex;
}

/**
 * Every avatar (starters, the gallery, yours), each in its own color, scrolling above a fixed bar
 * of colors for the selected one. Names show as tooltips after a moment.
 */
export function BotPanel({ entries, selected, look, color, onSelect, onColor, onNew }: BotPanelProps) {
  const current = color.toLowerCase();
  const own = defaultColor(selected.definition.id);
  const ownName = PALETTE.find((s) => s.value === own)?.name ?? own;
  const custom = !PALETTE.some((s) => s.value === current);
  // Hovered by a mouse: gets a faint ring (touch has no hover).
  const [hovered, setHovered] = useState<string | null>(null);

  // The studio opens on a random avatar: center it in the list if it's out of view. Only the list
  // scrolls, never the page.
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = scroller.current;
    const cell = box?.querySelector<HTMLElement>(".bot-cell.is-on");
    if (!box || !cell) return;
    const b = box.getBoundingClientRect();
    const c = cell.getBoundingClientRect();
    if (c.top < b.top || c.bottom > b.bottom) box.scrollTop += c.top - b.top - (b.height - c.height) / 2;
  }, []);

  return (
    <div className="bot">
      <div className="bots-scroll" ref={scroller}>
        <ul className="bots" aria-label="Avatars">
          {entries.map((entry) => {
            const on = entry.key === selected.key;
            // Built lazily (selected and hovered only) and memoized; it overlays the still exactly.
            const ring = on || entry.key === hovered ? outlineSvg(entry.definition) : "";
            return (
              <li key={entry.key}>
                <button
                  type="button"
                  className={on ? "bot-cell is-on" : "bot-cell"}
                  aria-pressed={on}
                  aria-label={entry.definition.name}
                  data-tip={entry.definition.name}
                  onClick={() => onSelect(entry.key)}
                  onPointerEnter={(e) => e.pointerType === "mouse" && setHovered(entry.key)}
                  onPointerLeave={() => setHovered(null)}
                >
                  <span className="bot-thumb">
                    {/* Static stills, each in its own color: one SVG each, no animation loop. */}
                    <BotAvatar
                      className="avatar-view"
                      definition={entry.definition}
                      color={colorOf(look, entry.key, entry.definition.id)}
                      still
                      view={THUMB_VIEW}
                      lookAt={THUMB_LOOK}
                      label=""
                    />
                    {ring ? <span className="bot-ring" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ring }} /> : null}
                  </span>
                </button>
              </li>
            );
          })}
          <li>
            <button type="button" className="bot-cell bot-new" aria-label="New avatar" data-tip="New avatar" onClick={onNew}>
              <span className="bot-plus">
                <Icon name="plus" />
              </span>
            </button>
          </li>
        </ul>
      </div>

      <div className="swatches" role="group" aria-label={`${selected.definition.name}’s color`}>
        {PALETTE.map((s) => {
          const tip = s.value === own ? `${s.name} (default)` : s.name;
          return (
            <button
              key={s.value}
              type="button"
              className={s.value === own ? "swatch is-own" : "swatch"}
              style={{ "--swatch": s.value } as CSSProperties}
              aria-label={tip}
              aria-pressed={current === s.value}
              data-tip={tip}
              onClick={() => onColor(s.value)}
            />
          );
        })}
        {/* Any color: the system picker, updating the avatar as it moves. */}
        <label
          className={custom ? "swatch swatch-custom is-on" : "swatch swatch-custom"}
          style={custom ? ({ "--swatch": current } as CSSProperties) : undefined}
          data-tip={custom ? `Custom ${current}` : "Custom color"}
        >
          <input type="color" aria-label="Custom color" value={fullHex(current)} onChange={(e) => onColor(e.target.value)} />
        </label>
        {/* Back to the avatar's own color; there's nothing to reset while it shows it. */}
        <button
          type="button"
          className="swatch swatch-reset"
          aria-label={`Reset to its default color, ${ownName}`}
          data-tip={current === own ? undefined : `Reset to ${ownName}`}
          disabled={current === own}
          onClick={() => onColor(own)}
        >
          <Icon name="rotate" />
        </button>
      </div>
    </div>
  );
}
