import { validateAvatar, type AvatarDefinition } from "open-bot-avatar";

export type ImportResult =
  | {
      ok: true;
      values: AvatarDefinition[];
      /** Honest notes about anything the importer did to the pasted text. */
      notes: string[];
    }
  | {
      ok: false;
      kind: "empty" | "syntax" | "contract";
      errors: string[];
      hints: string[];
      notes: string[];
      /** The JSON text that was actually parsed, for repair briefs. */
      source: string;
    };

interface Extracted {
  json: string;
  notes: string[];
}

/** Pulls the JSON out of a typical model reply: code fences or surrounding prose. */
export function extractJson(text: string): Extracted {
  const trimmed = text.trim();
  const notes: string[] = [];

  const fence = trimmed.match(/```[a-zA-Z0-9_-]*\s*\n([\s\S]*?)```/);
  if (fence) {
    const inner = fence[1].trim();
    if (inner !== trimmed) notes.push("Used the JSON inside the code fence.");
    return { json: inner, notes };
  }

  const first = trimmed.search(/[[{]/);
  if (first > 0) {
    const close = trimmed[first] === "{" ? "}" : "]";
    const last = trimmed.lastIndexOf(close);
    if (last > first) {
      notes.push("Ignored text outside the JSON.");
      return { json: trimmed.slice(first, last + 1), notes };
    }
  }

  return { json: trimmed, notes };
}

function locate(source: string, message: string): string | null {
  const lc = message.match(/line (\d+) column (\d+)/i);
  if (lc) return `line ${lc[1]}, column ${lc[2]}`;
  const pos = message.match(/position (\d+)/i);
  if (!pos) return null;
  const index = Number(pos[1]);
  const before = source.slice(0, index).split("\n");
  return `line ${before.length}, column ${before[before.length - 1].length + 1}`;
}

function syntaxHints(source: string): string[] {
  const hints: string[] = [];
  if (/,\s*[}\]]/.test(source)) hints.push("Remove trailing commas before } or ].");
  if (/'[^']*'\s*:/.test(source)) hints.push("Use double quotes for keys and strings.");
  if (/\/\/|\/\*/.test(source)) hints.push("Remove comments — JSON does not allow them.");
  if (!source.trim().endsWith("}") && !source.trim().endsWith("]"))
    hints.push("The reply looks cut off; ask the model to return the complete definition.");
  if (hints.length === 0) hints.push("Paste the model's reply exactly as returned.");
  return hints;
}

export function parseImport(text: string): ImportResult {
  if (!text.trim()) {
    return {
      ok: false,
      kind: "empty",
      errors: ["Nothing to import yet."],
      hints: ["Paste the JSON returned by the model, or drop a .json file."],
      notes: [],
      source: "",
    };
  }

  const { json, notes } = extractJson(text);

  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const where = locate(json, message);
    return {
      ok: false,
      kind: "syntax",
      errors: [`Not valid JSON${where ? ` (${where})` : ""}: ${message}`],
      hints: syntaxHints(json),
      notes,
      source: json,
    };
  }

  const items = Array.isArray(data) ? data : [data];
  if (items.length === 0) {
    return {
      ok: false,
      kind: "contract",
      errors: ["The list is empty."],
      hints: ["Paste one definition object, or a list of them."],
      notes,
      source: json,
    };
  }

  const values: AvatarDefinition[] = [];
  const errors: string[] = [];
  items.forEach((item, index) => {
    const result = validateAvatar(item);
    if (result.ok) values.push(result.value);
    else {
      const prefix = items.length > 1 ? `Item ${index + 1}: ` : "";
      errors.push(...result.errors.map((e) => prefix + e));
    }
  });

  if (errors.length > 0) {
    return {
      ok: false,
      kind: "contract",
      errors,
      hints: [
        "Copy the repair prompt and send it to the same chat or any model — it includes these errors.",
        "Keep geometry only: one body path and the eye pair. Colors and animation are applied here.",
      ],
      notes,
      source: json,
    };
  }

  if (items.length > 1) notes.push(`Imported ${values.length} definitions.`);
  return { ok: true, values, notes };
}
