import { useSyncExternalStore } from "react";
import type { Brief } from "./brief";

/**
 * Desktop agent apps a design prompt can open in, by deep link. None of the links send it; the
 * user reviews it there first. The picked app is kept in this browser and shared by every
 * prompt button.
 */
export const AGENT_TARGETS = {
  t3code: { label: "T3 Code", link: (prompt: string) => deepLink("t3code://new", { prompt }) },
  claude: { label: "Claude Code", link: (prompt: string) => deepLink("claude://code/new", { q: prompt }) },
  codex: { label: "Codex", link: (prompt: string) => deepLink("codex://threads/new", { prompt }) },
  cursor: { label: "Cursor", link: (prompt: string) => deepLink("cursor://anysphere.cursor-deeplink/prompt", { text: prompt }) },
  entoli: { label: "Entoli", link: (prompt: string) => deepLink("entoli://new", { prompt }) },
} as const;

export type AgentTarget = keyof typeof AGENT_TARGETS;

export const AGENT_TARGET_IDS = Object.keys(AGENT_TARGETS) as AgentTarget[];

const DEFAULT_TARGET: AgentTarget = "t3code";

/** The deep link that opens an app with a prompt filled in. */
export function agentLink(target: AgentTarget, prompt: string): string {
  return AGENT_TARGETS[target].link(prompt);
}

/**
 * Open an app with a prompt filled in. Apps cap link length (T3 Code at 8,000 characters) and the
 * full design prompt is far longer, so they get the linked form, which points to the hosted copy.
 */
export function openInAgent(target: AgentTarget, brief: Brief): void {
  window.location.href = agentLink(target, brief.linked);
}

/** encodeURIComponent, not URLSearchParams: some handlers read `+` as a plus sign. */
export function deepLink(base: string, params: Record<string, string>): string {
  const query = Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");
  return query === "" ? base : `${base}?${query}`;
}

const KEY = "open-bot-avatar:agent";
const listeners = new Set<() => void>();

function read(): AgentTarget {
  try {
    const raw = localStorage.getItem(KEY);
    return raw !== null && Object.hasOwn(AGENT_TARGETS, raw) ? (raw as AgentTarget) : DEFAULT_TARGET;
  } catch {
    return DEFAULT_TARGET;
  }
}

let current: AgentTarget | null = null;

/** The picked app, shared live by every prompt button on the page. */
export function useAgentTarget(): [AgentTarget, (next: AgentTarget) => void] {
  const target = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => (current ??= read()),
    () => DEFAULT_TARGET,
  );
  const set = (next: AgentTarget) => {
    current = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Storage may be disabled; the choice still holds for this page.
    }
    for (const listener of listeners) listener();
  };
  return [target, set];
}
