import { useState } from "react";
import { ACTIVITIES, MOTIONS, examples, type AvatarActivity, type AvatarMotion } from "open-bot-avatar";
import { BotAvatar } from "./BotAvatar";
import { GALLERY } from "./gallery";
import { ACTIVITY_INFO, MOOD_INFO, activityLabel, moodLabel } from "./moodInfo";
import { defaultColor } from "./studio/look";

const ALL = [...examples, ...GALLERY];
const MOOD_OPTIONS = MOTIONS.map((value) => ({ value, label: moodLabel(value) }));
const ACTIVITY_OPTIONS = [{ value: undefined, label: "None" }, ...ACTIVITIES.map((value) => ({ value, label: activityLabel(value) }))];

/** A row of choices for what the cards of one section are combined with. */
function Pick<T extends string | undefined>({ label, value, options, onChange }: { label: string; value: T; options: readonly { value: T; label: string }[]; onChange: (value: T) => void }) {
  return (
    <div className="mood-with">
      <span className="mood-with-label" aria-hidden="true">
        {label}
      </span>
      <div className="activity-pick" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.label}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            className={value === o.value ? "activity-pick-item is-on" : "activity-pick-item"}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Every mood and every activity side by side on one avatar, picked from the starters and the gallery. */
export function Moods() {
  const [id, setId] = useState(ALL[0].id);
  const [activity, setActivity] = useState<AvatarActivity | undefined>();
  const [mood, setMood] = useState<AvatarMotion>("idle");
  const def = ALL.find((d) => d.id === id) ?? ALL[0];
  const color = defaultColor(def.id);
  return (
    <main className="page moods-page">
      <section className="page-head">
        <h1>Moods and activities</h1>
        <p className="lead">
          The <code>mood</code> option is how the bot feels: it sets the face and posture. The <code>activity</code> option is
          what the bot is doing: it sets the rhythm, gaze and movement. Any two combine, and changes morph from the current face.
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
      <section aria-labelledby="moods-title">
        <h2 id="moods-title">Moods</h2>
        <Pick label="While" value={activity} options={ACTIVITY_OPTIONS} onChange={setActivity} />
        <div className="mood-grid mood-grid-wide">
          {MOTIONS.map((m) => (
            <section key={m} className="mood-card" aria-labelledby={`mood-${m}`}>
              <BotAvatar
                className="avatar-view mood-avatar"
                definition={def}
                color={color}
                mood={m}
                activity={activity}
                label={`${def.name}, ${MOOD_INFO[m].label.toLowerCase()}${activity ? `, ${activityLabel(activity).toLowerCase()}` : ""}`}
              />
              <h3 id={`mood-${m}`}>
                {MOOD_INFO[m].label} <code>"{m}"</code>
              </h3>
              <p>{MOOD_INFO[m].text}</p>
            </section>
          ))}
        </div>
      </section>
      <section aria-labelledby="activities-title">
        <h2 id="activities-title">Activities</h2>
        <Pick label="Feeling" value={mood} options={MOOD_OPTIONS} onChange={setMood} />
        <div className="mood-grid">
          {ACTIVITIES.map((a) => (
            <section key={a} className="mood-card" aria-labelledby={`activity-${a}`}>
              <BotAvatar
                className="avatar-view mood-avatar"
                definition={def}
                color={color}
                mood={mood}
                activity={a}
                label={`${def.name}, ${moodLabel(mood).toLowerCase()}, ${ACTIVITY_INFO[a].label.toLowerCase()}`}
              />
              <h3 id={`activity-${a}`}>
                {ACTIVITY_INFO[a].label} <code>"{a}"</code>
              </h3>
              <p>{ACTIVITY_INFO[a].text}</p>
            </section>
          ))}
        </div>
      </section>
    </main>
  );
}
