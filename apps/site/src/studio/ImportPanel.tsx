import { useId, useRef, useState, type DragEvent } from "react";
import type { AvatarDefinition } from "open-bot-avatar";
import { PromptActions } from "./PromptActions";
import { buildRepairBrief } from "./brief";
import { copyText } from "./files";
import { useFlash } from "./hooks";
import { parseImport, type ImportResult } from "./parseImport";
import { Icon } from "./ui";

interface ImportPanelProps {
  onImport: (definitions: AvatarDefinition[]) => { replaced: string[] };
}

type Outcome = ImportResult | { ok: true; values: AvatarDefinition[]; notes: string[]; replaced: string[] };

export function ImportPanel({ onImport }: ImportPanelProps) {
  const [text, setText] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [dragging, setDragging] = useState(false);
  const [copied, flashCopied] = useFlash();
  const [repairFallback, setRepairFallback] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const ids = useId();

  const run = (source: string) => {
    setRepairFallback(null);
    const result = parseImport(source);
    if (result.ok) {
      const { replaced } = onImport(result.values);
      setOutcome({ ...result, replaced });
    } else {
      setOutcome(result);
    }
  };

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 256 * 1024) {
      setRepairFallback(null);
      setOutcome({
        ok: false,
        kind: "syntax",
        errors: [`${file.name} is ${Math.round(file.size / 1024)} KB — too large for an avatar definition.`],
        hints: ["Definitions are a few hundred bytes. Check you picked the right file."],
        notes: [],
        source: "",
      });
      return;
    }
    const content = await file.text();
    setText(content);
    run(content);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    void readFile(event.dataTransfer.files[0]);
  };

  return (
    <div className="form">
      <p className="lead">Paste the model’s JSON reply or drop a .json file. It is validated before it is added.</p>

      <div
        className={dragging ? "dropzone is-dragging" : "dropzone"}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <textarea
          id={`${ids}-json`}
          aria-label="Definition JSON"
          className="input code json-input"
          rows={5}
          spellCheck={false}
          value={text}
          placeholder={'{\n  "version": 1, "id": "controller",\n  "name": "Controller", "body": { … },\n  "eyes": { "x": 50, "y": 46, … }\n}'}
          aria-describedby={`${ids}-result`}
          onChange={(e) => {
            setText(e.target.value);
            setOutcome(null);
            setRepairFallback(null);
          }}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData("text");
            // Validate a whole-field paste right away; partial edits wait for the button.
            if (pasted && (text.trim() === "" || e.currentTarget.selectionEnd - e.currentTarget.selectionStart === text.length)) {
              e.preventDefault();
              setText(pasted);
              run(pasted);
            }
          }}
        />
        {dragging ? <div className="dropzone-veil">Drop to import</div> : null}
      </div>

      <div className="actions">
        <button type="button" className="btn btn-primary" onClick={() => run(text)}>
          Add avatar
        </button>
        <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
          <Icon name="upload" />
          Choose file
        </button>
        {text ? (
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => {
              setText("");
              setOutcome(null);
              setRepairFallback(null);
            }}
          >
            Clear
          </button>
        ) : null}
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json,text/plain"
          hidden
          onChange={(e) => {
            void readFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>

      <div id={`${ids}-result`} aria-live="polite">
        {outcome ? (
          outcome.ok ? (
            <div className="notice notice-ok">
              <strong>
                Loaded {outcome.values.map((v) => v.name).join(", ")}
              </strong>
              <p>
                {"replaced" in outcome && outcome.replaced.length > 0
                  ? `Updated your saved ${outcome.replaced.join(", ")}.`
                  : "Saved in this browser and selected."}
              </p>
              {outcome.notes.length > 0 ? <p className="notice-note">{outcome.notes.join(" ")}</p> : null}
            </div>
          ) : (
            <div className="notice notice-error">
              <strong>
                {outcome.kind === "syntax"
                  ? "This isn't readable JSON yet"
                  : outcome.kind === "empty"
                    ? "Nothing to import"
                    : `Doesn't match the avatar contract (${outcome.errors.length} ${outcome.errors.length === 1 ? "issue" : "issues"})`}
              </strong>
              <ul className="errors">
                {outcome.errors.map((error, i) => (
                  <li key={i}>{error}</li>
                ))}
              </ul>
              <ul className="hints">
                {outcome.hints.map((hint, i) => (
                  <li key={i}>{hint}</li>
                ))}
              </ul>
              {outcome.notes.length > 0 ? <p className="notice-note">{outcome.notes.join(" ")}</p> : null}
              {outcome.kind !== "empty" && outcome.source ? (
                <PromptActions
                  size="small"
                  brief={buildRepairBrief(outcome.source, outcome.errors)}
                  copyWhat="repair prompt"
                  copied={copied}
                  copy={copyText}
                  onDone={(result) => {
                    setRepairFallback(result === false ? buildRepairBrief(outcome.source, outcome.errors).full : null);
                    if (result === true) flashCopied();
                  }}
                />
              ) : null}
              {repairFallback ? (
                <div role="alert">
                  <p className="notice-note">Couldn’t reach the clipboard. Select the prompt below and copy it yourself.</p>
                  <pre className="code" tabIndex={0} aria-label="Repair prompt">
                    {repairFallback}
                  </pre>
                </div>
              ) : null}
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}
