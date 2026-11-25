import { REPO } from "./route";

export interface Contributor {
  login: string;
  /** The profile picture, and the profile it links to. */
  picture: string;
  profile: string;
}

/** The account the repository belongs to. */
export const OWNER = new URL(REPO).pathname.split("/")[1];

/** The first `count` contributors besides the owner: GitHub lists whoever has the most commits first. */
export function topOthers(list: readonly Contributor[], count: number): Contributor[] {
  return list.filter((c) => c.login.toLowerCase() !== OWNER.toLowerCase()).slice(0, count);
}

/** The people in GitHub's answer: an entry that is a bot, or is not an account with a picture, is left out. */
export function readContributors(raw: unknown): Contributor[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry: { login?: unknown; type?: unknown; avatar_url?: unknown; html_url?: unknown } | null) => {
    if (entry?.type !== "User" || typeof entry.login !== "string") return [];
    if (typeof entry.avatar_url !== "string" || typeof entry.html_url !== "string") return [];
    return [{ login: entry.login, picture: entry.avatar_url, profile: entry.html_url }];
  });
}
