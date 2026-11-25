import { describe, expect, it } from "vitest";
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
