import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { DEFAULT_COLOR, examples, validateAvatar, type AvatarDefinition } from "open-bot-avatar";
import { GALLERY, findGallery } from "./gallery";
import { Actions } from "./studio/Actions";
import { BotPanel, type LibraryEntry } from "./studio/BotPanel";
import { CreatePanel } from "./studio/CreatePanel";
import { usePrefersReducedMotion, useStoredState } from "./studio/hooks";
import { ImportPanel } from "./studio/ImportPanel";
import { DEFAULT_LOOK, PALETTE, colorOf, defaultColor, reviveLook, withColor, type LookState } from "./studio/look";
import { readShare } from "./studio/share";
import { Settings } from "./studio/Settings";
import { Stage, type ViewAngle } from "./studio/Stage";

type Tab = "bot" | "generate" | "import";

const TABS: { id: Tab; label: string }[] = [
  { id: "bot", label: "Bot" },
  { id: "generate", label: "Generate" },
  { id: "import", label: "Import" },
];

/** Stored avatars are re-validated on load; anything that no longer passes is dropped. */
function reviveLibrary(raw: unknown): AvatarDefinition[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.flatMap((item) => {
    const result = validateAvatar(item);
    return result.ok ? [result.value] : [];
  });
}

const STARTERS: LibraryEntry[] = examples.map((definition) => ({
  key: `starter:${definition.id}`,
  source: "starter",
  definition,
}));

const GALLERY_ENTRIES: LibraryEntry[] = GALLERY.map((definition) => ({
  key: `gallery:${definition.id}`,
  source: "gallery",
  definition,
}));

/**
 * The starters and the gallery together, by their own color in the color bar's order (white, brown,
 * red … gray), then by name; a color outside the palette goes last. Picking another color for one
 * doesn't move it.
 */
function byColor(entries: LibraryEntry[]): LibraryEntry[] {
  const rank = (entry: LibraryEntry) => {
    const i = PALETTE.findIndex((s) => s.value === defaultColor(entry.definition.id));
    return i < 0 ? PALETTE.length : i;
  };
  return [...entries].sort((a, b) => rank(a) - rank(b) || a.definition.name.localeCompare(b.definition.name));
}

const LIBRARY = byColor([...STARTERS, ...GALLERY_ENTRIES]);

/** The studio opens on a random starter or gallery avatar, picked once per page load. */
const OPENING = LIBRARY[Math.floor(Math.random() * LIBRARY.length)]?.key ?? "";

const FRONT: ViewAngle = { yaw: 0, pitch: 0 };

/**
 * The avatar studio: a live avatar over a card with its picker, the design prompt to copy into a
 * chat model, and the import for what the model returns.
 */
export function Studio() {
  const [yoursDefs, setYoursDefs] = useStoredState<AvatarDefinition[]>("open-bot-avatar:yours", [], reviveLibrary);
  const [look, setLook] = useStoredState<LookState>("open-bot-avatar:look", DEFAULT_LOOK, reviveLook);
  const [selectedKey, setSelectedKey] = useState<string>(OPENING);
  const [tab, setTab] = useState<Tab>("bot");
  const [view, setView] = useState<ViewAngle>(FRONT);
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ bot: null, generate: null, import: null });

  const systemReduced = usePrefersReducedMotion();
  const reduced = look.motionPreference === "system" ? systemReduced : look.motionPreference === "reduced";
  const reducedMotion = look.motionPreference === "system" ? "system" : look.motionPreference === "reduced";

  const entries = useMemo<LibraryEntry[]>(
    () => [
      ...LIBRARY,
      // Yours follow, in the order they were added.
      ...yoursDefs.map((definition) => ({ key: `yours:${definition.id}`, source: "yours" as const, definition })),
    ],
    [yoursDefs],
  );
  const selected = useMemo(() => entries.find((e) => e.key === selectedKey) ?? entries[0], [entries, selectedKey]);

  const patchLook = useCallback((patch: Partial<LookState>) => setLook((prev) => ({ ...prev, ...patch })), [setLook]);
  const color = selected ? colorOf(look, selected.key, selected.definition.id) : DEFAULT_COLOR;
  const pickColor = useCallback(
    (next: string) => selected && setLook((prev) => withColor(prev, selected.key, selected.definition.id, next)),
    [selected, setLook],
  );

  const importDefinitions = useCallback(
    (definitions: AvatarDefinition[]) => {
      const existing = new Set(yoursDefs.map((d) => d.id));
      const replaced = definitions.filter((d) => existing.has(d.id)).map((d) => d.name);
      setYoursDefs((prev) => {
        const incoming = new Map(definitions.map((d) => [d.id, d]));
        const kept = prev.map((d) => incoming.get(d.id) ?? d);
        const added = definitions.filter((d) => !existing.has(d.id));
        return [...kept, ...added];
      });
      const last = definitions[definitions.length - 1];
      if (last) setSelectedKey(`yours:${last.id}`);
      return { replaced };
    },
    [yoursDefs, setYoursDefs, setSelectedKey],
  );

  // A link's query (studio/share.ts) picks the avatar, color and mood once, on opening. They're
  // saved like any other choice; anything in it that doesn't check out is left alone. The query is
  // then cleared, so coming back to the studio later doesn't apply it again.
  const shared = useRef(true);
  useEffect(() => {
    if (!shared.current) return;
    shared.current = false;
    const link = readShare(window.location.search);
    if (link.problem) console.warn(link.problem);
    let target: { key: string; id: string } | null = null;
    if (link.definition) {
      importDefinitions([link.definition]);
      target = { key: `yours:${link.definition.id}`, id: link.definition.id };
    } else if (link.avatar) {
      const id = link.avatar;
      let key = STARTERS.find((e) => e.definition.id === id)?.key ?? (yoursDefs.some((d) => d.id === id) ? `yours:${id}` : null);
      if (!key && findGallery(id)) key = `gallery:${id}`;
      if (key) {
        setSelectedKey(key);
        target = { key, id };
      }
    }
    // A link's color is for its avatar; without one it has nothing to apply to.
    setLook((prev) => {
      let next = link.mood ? { ...prev, motion: link.mood } : prev;
      if (link.color && target) next = withColor(next, target.key, target.id, link.color);
      return next;
    });
    if (window.location.search) window.history.replaceState(window.history.state, "", window.location.pathname + window.location.hash);
  }, [importDefinitions, yoursDefs, setSelectedKey, setLook]);

  const removeEntry = useCallback(
    (key: string) => {
      setYoursDefs((prev) => prev.filter((d) => `yours:${d.id}` !== key));
      if (key === selectedKey) setSelectedKey(OPENING);
    },
    [selectedKey, setSelectedKey, setYoursDefs],
  );

  const focusTab = (next: Tab) => {
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  const onTabKey = (event: KeyboardEvent, index: number) => {
    const keys: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 };
    if (event.key === "Home") return focusTab(TABS[0].id);
    if (event.key === "End") return focusTab(TABS[TABS.length - 1].id);
    const step = keys[event.key];
    if (!step) return;
    event.preventDefault();
    focusTab(TABS[(index + step + TABS.length) % TABS.length].id);
  };

  if (!selected) {
    return (
      <main className="empty">
        <p>No avatar definitions are available. Check that the engine exports at least one example.</p>
      </main>
    );
  }

  return (
    <div className="app">
      <main className="editor">
        <Stage
          definition={selected.definition}
          color={color}
          mood={look.motion}
          followCursor={look.followCursor}
          reducedMotion={reducedMotion}
          reduced={reduced}
          view={view}
          onView={setView}
          onMotion={(motion) => patchLook({ motion })}
        >
          <Actions entry={selected} color={color} mood={look.motion} onRemove={removeEntry} />
        </Stage>

        <section className="picker" aria-label="Avatar editor">
          <div className="tabs">
            <div role="tablist" aria-label="Editor sections" className="tablist">
              {TABS.map((t, index) => (
                <button
                  key={t.id}
                  ref={(el) => {
                    tabRefs.current[t.id] = el;
                  }}
                  type="button"
                  role="tab"
                  id={`tab-${t.id}`}
                  aria-selected={tab === t.id}
                  aria-controls={`tabpanel-${t.id}`}
                  tabIndex={tab === t.id ? 0 : -1}
                  className={tab === t.id ? "tab is-on" : "tab"}
                  onClick={() => setTab(t.id)}
                  onKeyDown={(e) => onTabKey(e, index)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <Settings look={look} systemReduced={systemReduced} onLook={patchLook} />
          </div>
          {TABS.map((t) => (
            <div
              key={t.id}
              className={`tabpanel tabpanel-${t.id}`}
              role="tabpanel"
              id={`tabpanel-${t.id}`}
              aria-labelledby={`tab-${t.id}`}
              hidden={tab !== t.id}
            >
              {t.id === "bot" ? (
                <BotPanel
                  entries={entries}
                  selected={selected}
                  look={look}
                  color={color}
                  onSelect={setSelectedKey}
                  onColor={pickColor}
                  onNew={() => focusTab("generate")}
                />
              ) : null}
              {t.id === "generate" ? <CreatePanel onSent={() => focusTab("import")} /> : null}
              {t.id === "import" ? <ImportPanel onImport={importDefinitions} /> : null}
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
