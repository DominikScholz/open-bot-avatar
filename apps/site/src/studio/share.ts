import { isMood, isState, resolveLook, validateAvatar, type AvatarDefinition, type AvatarMood, type AvatarState } from "open-bot-avatar";
import { DEFAULT_LOOK, PALETTE, defaultColor, type LookState } from "./look";

/**
 * Links that open the studio on an avatar, all read and written in the browser:
 *
 *   ?avatar=barbell          a starter, a gallery avatar or one of yours, by id
 *   &color=1f7cf2            a color: hex, with or without #, or a swatch name (blue)
 *   &state=working           idle, thinking, working, waiting, blocked or done
 *   &mood=happy              neutral, happy, surprised, angry or sad; an older link's mood=thinking
 *                            still opens the thinking state
 *   &def=…                   a whole definition, as base64url JSON (raw JSON works too); it's
 *                            validated like an import, then added to yours and selected
 */
export interface SharedLook {
  avatar?: string;
  definition?: AvatarDefinition;
  color?: string;
  state?: AvatarState;
  mood?: AvatarMood;
  /** Why `def` was left out, if it didn't decode or validate. */
  problem?: string;
}

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** A definition as compact JSON in base64url (UTF-8 safe, no padding). */
export function encodeDefinition(definition: AvatarDefinition): string {
  const bytes = new TextEncoder().encode(JSON.stringify(definition));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeDefinition(value: string): AvatarDefinition | string {
  let json = value.trim();
  if (!json.startsWith("{")) {
    try {
      const binary = atob(json.replace(/-/g, "+").replace(/_/g, "/"));
      json = new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
    } catch {
      return "The def parameter isn’t valid base64url or JSON.";
    }
  }
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return "The def parameter isn’t valid JSON.";
  }
  const result = validateAvatar(raw);
  return result.ok ? result.value : `The def parameter isn’t a valid avatar: ${result.errors.join("; ")}`;
}

function readColor(value: string | null): string | undefined {
  if (!value) return undefined;
  const swatch = PALETTE.find((c) => c.name.toLowerCase() === value.trim().toLowerCase());
  if (swatch) return swatch.value;
  return HEX.test(value.trim()) ? `#${value.trim().replace(/^#/, "").toLowerCase()}` : undefined;
}

/** What a link's query asks for; anything missing or invalid is left out. */
export function readShare(search: string): SharedLook {
  const params = new URLSearchParams(search);
  const shared: SharedLook = {};
  const def = params.get("def");
  if (def) {
    const decoded = decodeDefinition(def);
    if (typeof decoded === "string") shared.problem = decoded;
    else shared.definition = decoded;
  }
  const avatar = params.get("avatar")?.trim();
  if (avatar) shared.avatar = avatar;
  const color = readColor(params.get("color"));
  if (color) shared.color = color;
  const state = params.get("state")?.trim().toLowerCase();
  const mood = params.get("mood")?.trim().toLowerCase();
  // A link that names a state or a mood sets both: the one it leaves out is at its default. Before
  // the two were separate, `mood` was idle, thinking or happy, and those links open as they did.
  if (isState(state) || isMood(mood) || mood === "idle" || mood === "thinking") Object.assign(shared, resolveLook({ state, mood, motion: mood }));
  return shared;
}

/**
 * A link to this avatar in this look: a starter or gallery avatar by id, one of yours with its
 * definition. The color, state and mood are left out at their defaults (the avatar's own color,
 * idle, neutral).
 */
export function shareLink(
  base: string,
  entry: { source: "starter" | "gallery" | "yours"; definition: AvatarDefinition },
  look: { color: string; state: LookState["state"]; mood: LookState["mood"] },
): string {
  const params = new URLSearchParams();
  if (entry.source !== "yours") params.set("avatar", entry.definition.id);
  else params.set("def", encodeDefinition(entry.definition));
  const color = look.color.toLowerCase();
  if (color !== defaultColor(entry.definition.id)) {
    const swatch = PALETTE.find((c) => c.value === color);
    params.set("color", swatch ? swatch.name.toLowerCase() : color.replace(/^#/, ""));
  }
  if (look.state !== DEFAULT_LOOK.state) params.set("state", look.state);
  if (look.mood !== DEFAULT_LOOK.mood) params.set("mood", look.mood);
  return `${base}?${params}`;
}
