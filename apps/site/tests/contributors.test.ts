import { afterEach, describe, expect, it, vi } from "vitest";
import { OWNER, readContributors, topOthers } from "../src/contributors.ts";

describe("readContributors", () => {
  const person = { login: "someone", type: "User", avatar_url: "https://avatars.githubusercontent.com/u/1?v=4", html_url: "https://github.com/someone" };

  it("keeps people, in GitHub's order, and leaves out bots", () => {
    const bot = { ...person, login: "github-actions[bot]", type: "Bot" };
    expect(readContributors([person, bot, { ...person, login: "other" }]).map((c) => c.login)).toEqual(["someone", "other"]);
    expect(readContributors([person])[0]).toEqual({ login: "someone", picture: person.avatar_url, profile: person.html_url });
  });

  it("reads an answer that is not a list of accounts as no one", () => {
    expect(readContributors({ message: "API rate limit exceeded" })).toEqual([]);
    expect(readContributors([null, {}, { ...person, avatar_url: undefined }])).toEqual([]);
  });
});

describe("topOthers", () => {
  const named = (login: string) => ({ login, picture: "", profile: "" });

  it("is the first few besides the owner, in the order given", () => {
    const list = ["a", OWNER.toUpperCase(), "b", "c", "d"].map(named);
    expect(topOthers(list, 3).map((c) => c.login)).toEqual(["a", "b", "c"]);
    expect(topOthers([named(OWNER)], 3)).toEqual([]);
  });
});

describe("loadContributors", () => {
  const github = [{ login: "someone", type: "User", avatar_url: "https://avatars.githubusercontent.com/u/1?v=4", html_url: "https://github.com/someone" }];
  const answer = (status: number, body: unknown) => ({ ok: status === 200, status, json: async () => body });
  /** A fresh copy of the module, which asks once per page load, with `fetch` answering by URL. */
  const load = async (respond: (url: string) => ReturnType<typeof answer>) => {
    vi.resetModules();
    const fetched: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => (fetched.push(url), respond(url)));
    const { loadContributors } = await import("../src/contributors.ts");
    return { loadContributors, fetched };
  };
  afterEach(() => vi.unstubAllGlobals());

  it("asks GitHub, once", async () => {
    const { loadContributors, fetched } = await load(() => answer(200, github));
    expect((await loadContributors()).map((c) => c.login)).toEqual(["someone"]);
    await loadContributors();
    expect(fetched).toHaveLength(1);
    expect(fetched[0]).toContain("api.github.com");
  });

  it("falls back to the list the site was built with when GitHub refuses", async () => {
    const { loadContributors, fetched } = await load((url) => (url.includes("api.github.com") ? answer(403, { message: "API rate limit exceeded" }) : answer(200, github)));
    expect((await loadContributors()).map((c) => c.login)).toEqual(["someone"]);
    expect(fetched[1]).toMatch(/contributors\.json$/);
  });

  it("fails when neither has anyone, and asks again the next time", async () => {
    const { loadContributors, fetched } = await load((url) => (url.includes("api.github.com") ? answer(403, {}) : answer(200, [])));
    await expect(loadContributors()).rejects.toThrow();
    await expect(loadContributors()).rejects.toThrow();
    expect(fetched).toHaveLength(4);
  });
});
