import type { AvatarMotion } from "open-bot-avatar";

/** The agent lifecycle shown under the stage. */
export const LIFECYCLE_STATES: readonly { value: AvatarMotion; label: string }[] = [
  { value: "idle", label: "Idle" },
  { value: "working", label: "Working" },
  { value: "waiting", label: "Waiting" },
  { value: "blocked", label: "Blocked" },
  { value: "thinking", label: "Thinking" },
  { value: "done", label: "Done" },
];

const VALUES = new Set<AvatarMotion>(LIFECYCLE_STATES.map((state) => state.value));

/** A lifecycle state from stored data or a link; the older happy mood reads as done. */
export function lifecycleMotion(value: unknown): AvatarMotion | undefined {
  if (value === "happy") return "done";
  return typeof value === "string" && VALUES.has(value as AvatarMotion) ? (value as AvatarMotion) : undefined;
}
