import { useRef } from "react";
import { AGENT_TARGETS, AGENT_TARGET_IDS, openInAgent, useAgentTarget } from "./agents";
import type { Brief } from "./brief";
import { Icon, usePopover } from "./ui";

interface PromptActionsProps {
  brief: Brief;
  /** What the copy button copies, e.g. "prompt" for "Copy prompt" (dropped when narrow). */
  copyWhat: string;
  copied?: boolean;
  disabled?: boolean;
  /** "block": full-width, tall buttons (Generate); "small": compact ones (Import's repair). */
  size: "block" | "small";
  copy: (text: string) => Promise<boolean>;
  /** Called with true after copying (or false if the clipboard failed), or with "opened" after opening an app. */
  onDone: (result: boolean | "opened") => void;
}

/**
 * Two ways to use a design prompt: copy the full prompt for any chat model, or open the picked
 * agent app (Claude Code, Codex, Cursor or T3 Code) with it filled in, unsent. ▾ picks the app.
 */
export function PromptActions({ brief, copyWhat, copied, disabled, size, copy, onDone }: PromptActionsProps) {
  const [target, setTarget] = useAgentTarget();
  const { open, setOpen, root, trigger } = usePopover();
  const list = useRef<HTMLDivElement>(null);
  const app = AGENT_TARGETS[target].label;

  return (
    <div className={`prompt-actions prompt-actions-${size}`}>
      <button
        type="button"
        className="btn prompt-copy"
        disabled={disabled}
        aria-label={copied ? "Copied" : `Copy ${copyWhat}`}
        aria-live="polite"
        onClick={async () => {
          if (!disabled) onDone(await copy(brief.full));
        }}
      >
        <Icon name={copied ? "check" : "copy"} />
        <span className="btn-label">
          {copied ? (
            "Copied"
          ) : (
            <>
              Copy<span className="label-copy-extra"> {copyWhat}</span>
            </>
          )}
        </span>
      </button>
      <div className="split" ref={root}>
        <button
          type="button"
          className="btn btn-primary split-main"
          aria-label={`Open in ${app}`}
          disabled={disabled}
          onClick={() => {
            if (disabled) return;
            openInAgent(target, brief);
            onDone("opened");
          }}
        >
          <Icon name="arrow" />
          <span className="btn-label">
            <span className="label-open-extra">Open in </span>
            {app}
          </span>
        </button>
        <button
          ref={trigger}
          type="button"
          className="btn btn-primary split-more"
          aria-label="Choose the app"
          aria-haspopup="menu"
          aria-expanded={open}
          disabled={disabled}
          onClick={() => {
            setOpen(!open);
            requestAnimationFrame(() => list.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus());
          }}
        >
          <Icon name="chevron" />
        </button>
        {open ? (
          <div ref={list} className="popover popover-bottom popover-end" role="menu" aria-label="Open in">
            <span className="popover-label">Open in</span>
            {AGENT_TARGET_IDS.map((id) => (
              <button
                key={id}
                type="button"
                role="menuitemradio"
                aria-checked={id === target}
                className="menu-item menu-radio"
                onClick={() => {
                  setTarget(id);
                  setOpen(false);
                  trigger.current?.focus();
                }}
              >
                <span>{AGENT_TARGETS[id].label}</span>
              </button>
            ))}
            <small className="popover-note">The app opens with a short prompt that links to the design prompt. Nothing is sent.</small>
          </div>
        ) : null}
      </div>
    </div>
  );
}
