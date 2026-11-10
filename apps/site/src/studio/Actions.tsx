import { useMemo, useState } from "react";
import { renderAvatarSvg } from "open-bot-avatar";
import type { LibraryEntry } from "./BotPanel";
import { copyText, downloadText } from "./files";
import { useFlash } from "./hooks";
import type { LookState } from "./look";
import { shareLink } from "./share";
import { Icon, MenuButton } from "./ui";

/** Export and Copy for the avatar on the stage, each offering its two versions, and Remove for one of yours. */
export function Actions({ entry, color, mood, activity, onRemove }: { entry: LibraryEntry; color: string; mood: LookState["motion"]; activity: LookState["activity"]; onRemove: (key: string) => void }) {
  const [copied, flashCopied] = useFlash();
  const [problem, setProblem] = useState<string | null>(null);
  const { definition } = entry;
  const json = useMemo(() => `${JSON.stringify(definition, null, 2)}\n`, [definition]);

  const copy = async (text: string, fallback: string) => {
    if (await copyText(text)) {
      setProblem(null);
      flashCopied();
    } else setProblem(fallback);
  };

  return (
    <div className="actions-bar">
      <div className="actions-row">
        <MenuButton
          icon="download"
          label="Export"
          items={[
            {
              label: "Image",
              hint: "SVG still, this color",
              onSelect: () => {
                try {
                  downloadText(`${definition.id}.svg`, "image/svg+xml", renderAvatarSvg(definition, { color, size: 512, time: 0, reducedMotion: true }));
                  setProblem(null);
                } catch (error) {
                  setProblem(`Couldn’t render ${definition.name}: ${error instanceof Error ? error.message : String(error)}`);
                }
              },
            },
            { label: "Definition", hint: "JSON, geometry only", onSelect: () => downloadText(`${definition.id}.json`, "application/json", json) },
          ]}
        />
        <MenuButton
          icon="copy"
          label="Copy"
          done={copied ? "Copied" : undefined}
          items={[
            { label: "JSON", hint: "The definition", onSelect: () => void copy(json, "Couldn’t reach the clipboard; use Export instead.") },
            {
              label: "Link",
              hint: "Opens it in this color and mood",
              onSelect: () => {
                const link = shareLink(`${window.location.origin}${window.location.pathname}`, entry, { color, motion: mood, activity });
                void copy(link, `Couldn’t reach the clipboard. The link: ${link}`);
              },
            },
          ]}
        />
        {entry.source === "yours" ? (
          <button type="button" className="btn btn-sm btn-icon" onClick={() => onRemove(entry.key)} aria-label={`Remove ${definition.name}`} title={`Remove ${definition.name}`}>
            <Icon name="trash" />
          </button>
        ) : null}
      </div>
      <span className="sr-only" role="status">
        {copied ? "Copied" : ""}
      </span>
      {problem ? (
        <p className="note note-error" role="alert">
          {problem}
        </p>
      ) : null}
    </div>
  );
}
