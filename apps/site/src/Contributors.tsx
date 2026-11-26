import { CONTRIBUTORS, pictureAt } from "./contributorData";
import { REPO } from "./route";

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
