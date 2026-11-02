import { useState, type KeyboardEvent } from "react";
import { PromptActions } from "./PromptActions";
import { buildBrief, type Brief } from "./brief";
import { copyText } from "./files";
import { useFlash } from "./hooks";

/**
 * One description field. The app does not run a model: one button copies the full design prompt
 * plus the description for any chat model, the other opens a desktop agent app (agents.ts) with
 * the description and a link to the hosted design prompt; the JSON reply is pasted into Import.
 * Ctrl/Cmd+Enter copies.
 */
export function CreatePanel({ onSent }: { onSent: () => void }) {
  const [text, setText] = useState("");
  const [copied, flashCopied] = useFlash();
  const [failed, setFailed] = useState<string | null>(null);
  const ready = text.trim().length > 0;
  const brief: Brief = ready ? buildBrief(text) : { full: "", linked: "" };

  const done = (result: boolean | "opened") => {
    setFailed(result === false ? brief.full : null);
    if (result === true) flashCopied();
    if (result !== false) onSent();
  };

  const onKeyDown = async (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && ready) {
      e.preventDefault();
      done(await copyText(brief.full));
    }
  };

  return (
    <div className="form">
      <textarea
        className="input prompt"
        aria-label="Describe your avatar"
        aria-describedby="generate-hint"
        rows={3}
        value={text}
        placeholder="Describe your avatar…"
        onChange={(e) => {
          setText(e.target.value);
          setFailed(null);
        }}
        onKeyDown={onKeyDown}
      />
      <PromptActions size="block" brief={brief} copyWhat="prompt" copied={copied && !failed} disabled={!ready} onDone={done} copy={copyText} />
      <p id="generate-hint" className="note">
        Copy the full prompt into any chat model, or open it in an agent app, unsent. Then paste the JSON reply into Import.
      </p>
      <span className="sr-only" role="status">
        {copied && !failed ? "Generation prompt copied" : ""}
      </span>
      {failed ? (
        <div className="note note-error" role="alert">
          Couldn’t reach the clipboard. Select the prompt below and copy it yourself.
          <pre className="code" tabIndex={0} aria-label="Generation prompt">
            {failed}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
