// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { AGENT_TARGET_IDS, agentLink, deepLink } from "../src/studio/agents.ts";
import { AVATAR_SYSTEM_PROMPT, PROMPT_FILE, buildBrief, buildRepairBrief, promptUrl } from "../src/studio/brief.ts";
import { getExample } from "open-bot-avatar";

const prompt = "Design a mug & a cup + saucer\nline two: 100% done?";

describe("agent links", () => {
  it.each(AGENT_TARGET_IDS)("%s carries the whole prompt intact", (id) => {
    const link = agentLink(id, prompt);
    const url = new URL(link);
    const values = [...url.searchParams.values()];
    expect(values).toEqual([prompt]);
    // `+` must stay a plus sign: it is encoded, never left bare.
    expect(link).not.toMatch(/\+/);
  });

  it("uses each app's documented scheme and parameter", () => {
    expect(agentLink("claude", "x")).toBe("claude://code/new?q=x");
    expect(agentLink("codex", "x")).toBe("codex://threads/new?prompt=x");
    expect(agentLink("cursor", "x")).toBe("cursor://anysphere.cursor-deeplink/prompt?text=x");
    expect(agentLink("t3code", "x")).toBe("t3code://new?prompt=x");
  });

  it("leaves a bare base when there are no parameters", () => {
    expect(deepLink("t3code://new", {})).toBe("t3code://new");
  });
});

describe("prompts sent to apps", () => {
  const url = "https://example.github.io/open-bot-avatar/prompt.md";

  it("link the hosted design prompt instead of carrying it", () => {
    const brief = buildBrief("a barbell for my gym coach", url);
    expect(brief.full.startsWith(AVATAR_SYSTEM_PROMPT)).toBe(true);
    expect(brief.linked).toContain(url);
    expect(brief.linked).not.toContain(AVATAR_SYSTEM_PROMPT.slice(0, 200));
    expect(brief.linked).toContain("a barbell for my gym coach");
  });

  it.each(AGENT_TARGET_IDS)("%s gets a link under T3 Code's 8,000-character cap", (id) => {
    const description = "a ceramic coffee mug with a chunky handle on the right, steam rising, for my barista friend. ".repeat(10);
    const source = JSON.stringify(getExample("barbell"));
    for (const brief of [buildBrief(description, url), buildRepairBrief(source, ["eyes overlap the edge", "path is open"], url)]) {
      expect(agentLink(id, brief.linked).length).toBeLessThan(8000);
    }
  });

  it("points to prompt.md under the site's base", () => {
    expect(promptUrl()).toBe(new URL(`${import.meta.env.BASE_URL}${PROMPT_FILE}`, window.location.origin).href);
    expect(promptUrl().endsWith("/prompt.md")).toBe(true);
  });
});
