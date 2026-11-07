import { useState } from "react";
import { MOTIONS, examples } from "open-bot-avatar";
import { BotAvatar } from "./BotAvatar";
import { GALLERY } from "./gallery";
import { MOOD_INFO } from "./moodInfo";
import { defaultColor } from "./studio/look";

const ALL = [...examples, ...GALLERY];

/** Every mood side by side on one avatar, picked from the starters and the gallery. */
export function Moods() {
  const [id, setId] = useState(ALL[0].id);
  const def = ALL.find((d) => d.id === id) ?? ALL[0];
  const color = defaultColor(def.id);
  return (
    <main className="page moods-page">
      <section className="page-head">
        <h1>Moods</h1>
        <p className="lead">
          Every mood the renderer has, live. Set one with the <code>mood</code> option; changes morph from the current face.
        </p>
      </section>
      <div className="moods-pick" role="radiogroup" aria-label="Avatar">
        {ALL.map((d) => (
          <button
            key={d.id}
            type="button"
            role="radio"
            aria-checked={d.id === id}
            aria-label={d.name}
            className={d.id === id ? "moods-pick-item is-on" : "moods-pick-item"}
            onClick={() => setId(d.id)}
          >
            <BotAvatar definition={d} color={defaultColor(d.id)} still label="" />
          </button>
        ))}
      </div>
      <div className="mood-grid">
        {MOTIONS.map((mood) => (
          <section key={mood} className="mood-card" aria-labelledby={`mood-${mood}`}>
            <BotAvatar
              className="avatar-view mood-avatar"
              definition={def}
              color={color}
              mood={mood}
              label={`${def.name}, ${MOOD_INFO[mood].label.toLowerCase()}`}
            />
            <h2 id={`mood-${mood}`}>
              {MOOD_INFO[mood].label} <code>"{mood}"</code>
            </h2>
            <p>{MOOD_INFO[mood].text}</p>
          </section>
        ))}
      </div>
    </main>
  );
}
