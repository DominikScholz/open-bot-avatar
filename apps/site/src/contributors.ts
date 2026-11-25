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

/** GitHub's list of who has commits in the repository, most first. */
const SOURCE = `https://api.github.com/repos/${new URL(REPO).pathname.slice(1)}/contributors?per_page=100`;

/** The people in GitHub's answer: an entry that is a bot, or is not an account with a picture, is left out. */
export function readContributors(raw: unknown): Contributor[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry: { login?: unknown; type?: unknown; avatar_url?: unknown; html_url?: unknown } | null) => {
    if (entry?.type !== "User" || typeof entry.login !== "string") return [];
    if (typeof entry.avatar_url !== "string" || typeof entry.html_url !== "string") return [];
    return [{ login: entry.login, picture: entry.avatar_url, profile: entry.html_url }];
  });
}

/** The last answer, kept in the browser: GitHub allows a visitor 60 requests an hour, shared by everyone behind one address. */
const KEPT = "open-bot-avatar:contributors";
const FRESH_MS = 60 * 60 * 1000;

function kept(): { at: number; list: Contributor[] } | null {
  try {
    const stored = JSON.parse(localStorage.getItem(KEPT) ?? "null") as { at?: unknown; list?: unknown } | null;
    const list = Array.isArray(stored?.list) ? (stored.list as Contributor[]).filter((c) => typeof c?.login === "string" && typeof c.picture === "string" && typeof c.profile === "string") : [];
    return typeof stored?.at === "number" && list.length > 0 ? { at: stored.at, list } : null;
  } catch {
    return null;
  }
}

let loading: Promise<Contributor[]> | undefined;

/**
 * The contributors, asked for once per page load. An answer less than an hour old is used again
 * without asking; when GitHub does not answer, an older one is better than none. A request that
 * failed with nothing kept is made again the next time.
 */
export function loadContributors(): Promise<Contributor[]> {
  const last = kept();
  if (last && Date.now() - last.at < FRESH_MS) return Promise.resolve(last.list);
  loading ??= fetch(SOURCE, { headers: { Accept: "application/vnd.github+json" } })
    .then((response) => {
      if (!response.ok) throw new Error(`GitHub answered ${response.status}.`);
      return response.json();
    })
    .then((raw) => {
      const list = readContributors(raw);
      if (list.length === 0) throw new Error("GitHub listed no one.");
      try {
        localStorage.setItem(KEPT, JSON.stringify({ at: Date.now(), list }));
      } catch {
        // Storage is full or switched off: the list is asked for again next time.
      }
      return list;
    })
    .catch((error) => {
      loading = undefined;
      if (last) return last.list;
      throw error;
    });
  return loading;
}
