import built from "virtual:contributors";
import { readContributors, type Contributor } from "./contributors";
import { REPO } from "./route";

/** Everyone GitHub counted as a contributor when the site was built. Every push to main builds it again. */
export const CONTRIBUTORS = readContributors(built);

/** A profile picture at `size` CSS pixels, asked for at twice that for sharp screens. */
export function pictureAt(person: Contributor, size: number): string {
  return `${person.picture}${person.picture.includes("?") ? "&" : "?"}s=${2 * size}`;
}

/** Who built it. */
export function Contributors() {
  return (
    <main className="page contributors">
      <section className="page-head">
        <h1>Contributors</h1>
        <p className="lead">Open Bot Avatar is open source. These are the people who built it.</p>
      </section>

      {CONTRIBUTORS.length === 0 ? (
        <p role="status">
          This build of the site has no list. It is on <a href={`${REPO}/graphs/contributors`}>GitHub</a>.
        </p>
      ) : (
        <ul className="people">
          {CONTRIBUTORS.map((person) => (
            <li key={person.login}>
              <a className="person" href={person.profile}>
                <img src={pictureAt(person, 72)} width={72} height={72} alt="" loading="lazy" />
                <span>{person.login}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
