import type { LookState, MotionPreference } from "./look";
import { Icon, Segmented, Switch, usePopover } from "./ui";

/** The less-used settings behind a gear at the right of the tabs: following the cursor, and motion. */
export function Settings({ look, systemReduced, onLook }: { look: LookState; systemReduced: boolean; onLook: (patch: Partial<LookState>) => void }) {
  const { open, setOpen, root, trigger } = usePopover();
  return (
    <div className="menu tab-tools" ref={root}>
      <button
        ref={trigger}
        type="button"
        className={open ? "tab tab-icon is-on" : "tab tab-icon"}
        aria-label="Settings"
        aria-expanded={open}
        aria-haspopup="dialog"
        data-tip={open ? undefined : "Settings"}
        onClick={() => setOpen(!open)}
      >
        <Icon name="gear" />
      </button>
      {open ? (
        <div className="popover popover-bottom popover-end settings" role="dialog" aria-label="Settings">
          <span className="settings-title">Settings</span>
          <div className="settings-row">
            <Switch label="Eyes follow cursor" hint="The live avatar looks at your pointer." checked={look.followCursor} onChange={(followCursor) => onLook({ followCursor })} />
          </div>
          <div className="settings-row settings-stack">
            <span className="settings-label" id="settings-motion">
              Motion
              <small>{look.motionPreference === "system" ? `Follows your device: ${systemReduced ? "reduced" : "full"} motion now.` : look.motionPreference === "reduced" ? "No idle animation." : "Idle animation always on."}</small>
            </span>
            <Segmented<MotionPreference>
              label="Motion"
              size="sm"
              value={look.motionPreference}
              options={[
                { value: "system", label: "System" },
                { value: "reduced", label: "Reduced" },
                { value: "full", label: "Full" },
              ]}
              onChange={(motionPreference) => onLook({ motionPreference })}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
