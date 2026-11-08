/** Blocked and thinking replace the silhouette with punctuation, as in the Grok Bot design. */
const BLOCKED_PATH =
  "M99.2705 81.2705A15 15 0 0 1 129.2705 81.2705L122.7705 153.7705A8.5 8.5 0 0 1 105.7705 153.7705Z";

export function StatusGlyph({
  kind,
  color,
  reducedMotion,
}: {
  kind: "blocked" | "thinking";
  color: string;
  reducedMotion?: boolean;
}) {
  return (
    <div
      className={`lifecycle-glyph is-${kind}${reducedMotion ? " is-still" : ""}`}
      role="img"
      aria-label={kind === "blocked" ? "Blocked" : "Thinking"}
    >
      <svg viewBox="-15 -15 259 259" aria-hidden="true" focusable="false">
        <g fill={color} stroke="none">
          {kind === "blocked" ? (
            <>
              {/* The mark is static once it lands; only the dot drops in, as on the Grok Bot. */}
              <path className="alert-bar" d={BLOCKED_PATH} />
              <circle className="alert-dot" cx="114.2705" cy="177" r="11" />
            </>
          ) : (
            <g className="think-group">
              {/* Three equal dots breathe out of step: full ink for the active one, dimmed neighbours. */}
              <circle className="think-dot" cx="52.27" cy="112" r="23" opacity={0.55} />
              <circle className="think-dot" cx="114.27" cy="112" r="23" opacity={1} />
              <circle className="think-dot" cx="176.27" cy="112" r="23" opacity={0.7} />
            </g>
          )}
        </g>
      </svg>
    </div>
  );
}

/**
 * The paint of the working and done states lives in Band.tsx: on the Grok Bot
 * it is a particle system whose orbits are driven by the same spin that turns
 * the avatar, so the paint and the face move together.
 */
