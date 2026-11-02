import SYSTEM_PROMPT from "../../../../skills/generate-avatar/references/system-prompt.md?raw";

/**
 * The canonical avatar design prompt (schema, geometry rules, face-first
 * proportions, examples). Shared verbatim with the generate-avatar skill, so
 * the copied text works in any chat model without repo or skill access.
 */
export const AVATAR_SYSTEM_PROMPT = SYSTEM_PROMPT.trim();

/** The site also serves the design prompt as this file (vite.config.ts), so short prompts can link to it. */
export const PROMPT_FILE = "prompt.md";

/** Where this site serves the design prompt, e.g. https://<user>.github.io/open-bot-avatar/prompt.md. */
export function promptUrl(): string {
  return new URL(`${import.meta.env.BASE_URL}${PROMPT_FILE}`, window.location.origin).href;
}

/**
 * A prompt in two forms: `full` carries the whole design prompt, for any chat model; `linked`
 * points to the hosted copy instead, short enough for an app's deep link (agents can fetch it).
 */
export interface Brief {
  full: string;
  linked: string;
}

function compose(task: string[], url: string): Brief {
  return {
    full: [AVATAR_SYSTEM_PROMPT, "", "---", "", ...task].join("\n"),
    linked: [
      `Fetch the Open Bot Avatar design prompt at ${url} and follow it exactly: it defines the JSON schema, the geometry rules and the proportions.`,
      "",
      ...task,
    ].join("\n"),
  };
}

/**
 * The generation prompt: the design prompt followed by the user's description, passed through
 * verbatim. The model infers the object, view, parts, proportions, id and name from it.
 */
export function buildBrief(description: string, url = promptUrl()): Brief {
  return compose(
    ["Create one avatar definition from this description:", "", description.trim(), "", "Return only the JSON definition, nothing else."],
    url,
  );
}

/** A prompt asking a model to repair a definition that failed validation. */
export function buildRepairBrief(source: string, errors: string[], url = promptUrl()): Brief {
  return compose(
    [
      "This avatar definition failed validation. Fix it while keeping the same character.",
      "",
      "Validation errors:",
      ...errors.map((e) => `- ${e}`),
      "",
      "Definition:",
      source.trim(),
      "",
      "Return only the corrected JSON definition, nothing else.",
    ],
    url,
  );
}
