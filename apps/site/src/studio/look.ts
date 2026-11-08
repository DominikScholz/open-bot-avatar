import type { AvatarMotion } from "open-bot-avatar";
import DEFAULT_COLORS from "../../../../gallery/colors.json";
import { lifecycleMotion } from "./states";

export type MotionPreference = "system" | "reduced" | "full";

export interface LookState {
  /** Colors picked for avatars, by library key; an avatar not in here shows its default color. */
  colors: Record<string, string>;
  motion: AvatarMotion;
  followCursor: boolean;
  motionPreference: MotionPreference;
}

export const SIGNATURE = "#ff6a1a";

/** Saturated body colors, in the order of the reference picker. */
export const PALETTE = [
  { value: "#f4f4f4", name: "White" },
  { value: "#a8693f", name: "Brown" },
  { value: "#f2384b", name: "Red" },
  { value: SIGNATURE, name: "Orange" },
  { value: "#f8a01c", name: "Amber" },
  { value: "#1fbf68", name: "Green" },
  { value: "#14b3a5", name: "Teal" },
  { value: "#1f7cf2", name: "Blue" },
  { value: "#8b5cf6", name: "Purple" },
  { value: "#ec4899", name: "Pink" },
  { value: "#7a7a7a", name: "Gray" },
];

export const DEFAULT_LOOK: LookState = {
  colors: {},
  motion: "idle",
  followCursor: true,
  motionPreference: "system",
};

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Colors an avatar of yours can get by default: the palette without its quiet white and gray. */
const BRIGHT = PALETTE.filter((s) => s.name !== "White" && s.name !== "Gray").map((s) => s.value);

/**
 * An avatar's own color: the one gallery/colors.json gives it (every starter and gallery avatar has
 * one), or, for one of yours, a palette color picked from its id, so it stays the same everywhere.
 */
export function defaultColor(id: string): string {
  const listed = (DEFAULT_COLORS as Record<string, string>)[id];
  if (listed) return listed;
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return BRIGHT[hash % BRIGHT.length];
}

/** The color an avatar shows: the one picked for it, or its own. */
export function colorOf(look: Pick<LookState, "colors">, key: string, id: string): string {
  return look.colors[key] ?? defaultColor(id);
}

/** Pick a color for one avatar; picking its own color forgets the choice. */
export function withColor(look: LookState, key: string, id: string, color: string): LookState {
  const { [key]: _, ...colors } = look.colors;
  return { ...look, colors: color.toLowerCase() === defaultColor(id) ? colors : { ...colors, [key]: color.toLowerCase() } };
}

/** Revive a stored look; anything missing or invalid falls back to the default. */
export function reviveLook(raw: unknown): LookState | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Partial<Record<keyof LookState, unknown>>;
  return {
    colors:
      r.colors && typeof r.colors === "object"
        ? Object.fromEntries(Object.entries(r.colors).flatMap(([key, value]) => (typeof value === "string" && HEX.test(value) ? [[key, value.toLowerCase()]] : [])))
        : {},
    motion: lifecycleMotion(r.motion) ?? "idle",
    followCursor: typeof r.followCursor === "boolean" ? r.followCursor : true,
    motionPreference: r.motionPreference === "reduced" || r.motionPreference === "full" ? r.motionPreference : "system",
  };
}
