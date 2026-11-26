import built from "virtual:contributors";
import { readContributors, type Contributor } from "./contributors";

/** Everyone GitHub counted as a contributor when the site was built. Every push to main builds it again. */
export const CONTRIBUTORS = readContributors(built);

/** A profile picture at `size` CSS pixels, asked for at twice that for sharp screens. */
export function pictureAt(person: Contributor, size: number): string {
  return `${person.picture}${person.picture.includes("?") ? "&" : "?"}s=${2 * size}`;
}
