import { isMotion, validateAvatar, type AvatarDefinition, type AvatarMotion } from "open-bot-avatar";
import { DEFAULT_LOOK, PALETTE, defaultColor, type LookState } from "./look";

/**
 * Links that open the studio on an avatar, all read and written in the browser:
 *
 *   ?avatar=barbell          a starter, a gallery avatar or one of yours, by id
 *   &color=1f7cf2            a color: hex, with or without #, or a swatch name (blue)
 *   &mood=happy              a mood (MOTIONS in open-bot-avatar), e.g. idle, happy or sad
 *   &def=…                   a whole definition, as base64url JSON (raw JSON works too); it's
 *                            validated like an import, then added to yours and selected
 */
export interface SharedLook {
  avatar?: string;
  definition?: AvatarDefinition;
  color?: string;
  mood?: AvatarMotion;
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
  const mood = params.get("mood")?.trim().toLowerCase();
  if (isMotion(mood)) shared.mood = mood;
  return shared;
}

/**
 * A link to this avatar in this look: a starter or gallery avatar by id, one of yours with its
 * definition. The color and mood are left out at their defaults (the avatar's own color, idle).
 */
export function shareLink(
  base: string,
  entry: { source: "starter" | "gallery" | "yours"; definition: AvatarDefinition },
  look: { color: string; motion: LookState["motion"] },
): string {
  const params = new URLSearchParams();
  if (entry.source !== "yours") params.set("avatar", entry.definition.id);
  else params.set("def", encodeDefinition(entry.definition));
  const color = look.color.toLowerCase();
  if (color !== defaultColor(entry.definition.id)) {
    const swatch = PALETTE.find((c) => c.value === color);
    params.set("color", swatch ? swatch.name.toLowerCase() : color.replace(/^#/, ""));
  }
  if (look.motion !== DEFAULT_LOOK.motion) params.set("mood", look.motion);
  return `${base}?${params}`;
}
