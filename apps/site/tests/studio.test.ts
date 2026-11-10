import { describe, expect, it } from "vitest";
import { examples, validateAvatar } from "open-bot-avatar";
import { AVATAR_SYSTEM_PROMPT, buildBrief, buildRepairBrief } from "../src/studio/brief.ts";
import { extractJson, parseImport } from "../src/studio/parseImport.ts";
import { readShare, shareLink } from "../src/studio/share.ts";
import { DEFAULT_LOOK, PALETTE, defaultColor, reviveLook, withColor } from "../src/studio/look.ts";
import DEFAULT_COLORS from "../../../gallery/colors.json";
import { readdirSync } from "node:fs";

const controller = examples.find((e) => e.id === "controller")!;
const json = JSON.stringify(controller, null, 2);

describe("parseImport", () => {
  it("accepts a valid starter definition", () => {
    const result = parseImport(json);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.values[0].id).toBe("controller");
  });

  it("unwraps a fenced model reply and says so", () => {
    const result = parseImport(`Here you go:\n\n\`\`\`json\n${json}\n\`\`\`\nEnjoy!`);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.notes.join(" ")).toMatch(/code fence/);
  });

  it("strips prose around a bare object", () => {
    expect(extractJson(`Sure! ${json} Hope that helps`).notes).toContain("Ignored text outside the JSON.");
  });

  it("imports a list of definitions", () => {
    const result = parseImport(JSON.stringify(examples.slice(0, 2)));
    expect(result.ok && result.values.length).toBe(2);
  });

  it("reports empty input", () => {
    const result = parseImport("   ");
    expect(!result.ok && result.kind).toBe("empty");
  });

  it("locates syntax errors and suggests fixes", () => {
    const result = parseImport('{\n  "version": 1,\n  "id": "x",\n}');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("syntax");
      expect(result.errors[0]).toMatch(/line \d+, column \d+/);
      expect(result.hints.join(" ")).toMatch(/trailing commas/);
    }
  });

  it("surfaces contract errors from the engine validator", () => {
    const result = parseImport(JSON.stringify({ ...controller, eyes: { x: 50, y: 50, spacing: 15 } }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("contract");
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it("prefixes per-item errors in lists", () => {
    const result = parseImport(JSON.stringify([controller, { version: 1 }]));
    expect(!result.ok && result.errors.every((e) => e.startsWith("Item 2: "))).toBe(true);
  });
});

describe("briefs", () => {
  const AT = "https://example.github.io/open-bot-avatar/prompt.md";

  it("copies the full self-contained design prompt plus the verbatim description", () => {
    const brief = buildBrief("  a kettlebell for my gym coach,\nhandle on top  ", AT).full;
    expect(brief.startsWith(AVATAR_SYSTEM_PROMPT)).toBe(true);
    expect(brief).toContain("\na kettlebell for my gym coach,\nhandle on top\n");
    expect(brief).toMatch(/Return only the JSON definition/);
    expect(brief).not.toMatch(/Object:|Used for:|Notes:|Suggested id/);
  });

  it("needs no repo, skill or specific model", () => {
    for (const text of [buildBrief("x", AT).full, buildRepairBrief("{}", ["e"], AT).full]) {
      expect(text).not.toMatch(/opus|claude|skills?\/|SKILL\.md|validate\.sh/i);
    }
    expect(AVATAR_SYSTEM_PROMPT).toMatch(/"version":1,"id":"slug"/);
    expect(AVATAR_SYSTEM_PROMPT).toMatch(/Face first/);
  });

  it("builds self-contained repair prompts with every error", () => {
    const brief = buildRepairBrief("{}", ["a is wrong", "b is missing"], AT).full;
    expect(brief.startsWith(AVATAR_SYSTEM_PROMPT)).toBe(true);
    expect(brief).toContain("- a is wrong\n- b is missing");
    expect(brief).toContain("Definition:\n{}\n");
  });
});

describe("share links", () => {
  const mug = examples.find((e) => e.id === "mug")!;

  it("round-trip a starter, color and mood", () => {
    const link = shareLink("https://example.test/", { source: "starter", definition: mug }, { color: "#ec4899", motion: "happy" });
    expect(link).toBe("https://example.test/?avatar=mug&color=pink&mood=happy");
    expect(readShare(new URL(link).search)).toEqual({ avatar: "mug", color: "#ec4899", mood: "happy" });
  });

  it("round-trip an activity next to the mood, and leave it out when none", () => {
    const link = shareLink("https://example.test/", { source: "starter", definition: mug }, { color: defaultColor("mug"), motion: "sad", activity: "working" });
    expect(link).toBe("https://example.test/?avatar=mug&mood=sad&activity=working");
    expect(readShare(new URL(link).search)).toEqual({ avatar: "mug", mood: "sad", activity: "working" });
    expect(shareLink("https://example.test/", { source: "starter", definition: mug }, { color: defaultColor("mug"), motion: "idle", activity: undefined })).toBe("https://example.test/?avatar=mug");
  });

  it("ignore an unknown activity and keep mood=thinking as a mood", () => {
    expect(readShare("?activity=dancing")).toEqual({});
    expect(readShare("?mood=thinking")).toEqual({ mood: "thinking" });
  });

  it("leave out an avatar's own color", () => {
    const link = shareLink("https://example.test/", { source: "starter", definition: mug }, { color: defaultColor("mug"), motion: "idle" });
    expect(link).toBe("https://example.test/?avatar=mug");
  });

  it("carry a definition of yours whole, and validate it on the way in", () => {
    const own = { ...mug, id: "my-mug", name: "My Mug" };
    const link = shareLink("https://example.test/", { source: "yours", definition: own }, { color: "#ff6a1a", motion: "idle" });
    const valid = validateAvatar(own);
    expect(valid.ok && readShare(new URL(link).search).definition).toEqual(valid.ok && valid.value);
    expect(readShare("?def=bm90LWpzb24").problem).toMatch(/JSON/);
  });
});

describe("avatar colors", () => {
  const galleryIds = readdirSync(new URL("../../../gallery/", import.meta.url))
    .filter((f) => f.endsWith(".json") && f !== "colors.json")
    .map((f) => f.replace(/\.json$/, ""));

  it("gives every starter and gallery avatar its own listed color, and lists nothing else", () => {
    const ids = [...examples.map((e) => e.id), ...galleryIds].sort();
    expect(Object.keys(DEFAULT_COLORS).sort()).toEqual(ids);
    for (const color of Object.values(DEFAULT_COLORS)) expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("gives an avatar of yours a stable bright palette color", () => {
    const color = defaultColor("my-own-thing");
    expect(defaultColor("my-own-thing")).toBe(color);
    expect(PALETTE.some((s) => s.value === color && s.name !== "White" && s.name !== "Gray")).toBe(true);
  });

  it("keeps a picked color for that avatar only, and forgets it when its own color is picked", () => {
    const blue = withColor(DEFAULT_LOOK, "starter:barbell", "barbell", "#1F7CF2");
    expect(blue.colors).toEqual({ "starter:barbell": "#1f7cf2" });
    expect(withColor(blue, "starter:barbell", "barbell", defaultColor("barbell")).colors).toEqual({});
  });

  it("drops invalid stored colors", () => {
    expect(reviveLook({ colors: { a: "#123456", b: "red", c: 4 }, color: "#ffffff" })?.colors).toEqual({ a: "#123456" });
  });
});
