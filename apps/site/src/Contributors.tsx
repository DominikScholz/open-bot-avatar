import { useEffect, useState } from "react";
import { loadContributors, type Contributor } from "./contributors";
import { REPO } from "./route";

/** The contributors, read from GitHub: undefined while it is asked, null when it did not answer. */
export function useContributors(): Contributor[] | null | undefined {
  const [people, setPeople] = useState<Contributor[] | null | undefined>(undefined);
  useEffect(() => {
    let current = true;
    loadContributors().then(
      (list) => current && setPeople(list),
      () => current && setPeople(null),
    );
    return () => {
      current = false;
    };
  }, []);
  return people;
}

/** A profile picture at `size` CSS pixels, asked for at twice that for sharp screens. */
export function pictureAt(person: Contributor, size: number): string {
  return `${person.picture}${person.picture.includes("?") ? "&" : "?"}s=${2 * size}`;
}

/** Who built it, read from GitHub when the page opens. */
export function Contributors() {
  const people = useContributors();
  return (
    <main className="page contributors">
      <section className="page-head">
        <h1>Contributors</h1>
        <p className="lead">Open Bot Avatar is open source. These are the people who built it.</p>
      </section>

      {people === undefined ? (
        <p role="status">Loading the list from GitHub.</p>
      ) : people === null ? (
        <p role="status">
          GitHub did not answer. The list is also on <a href={`${REPO}/graphs/contributors`}>GitHub</a>.
        </p>
      ) : (
        <ul className="people">
          {people.map((person) => (
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
