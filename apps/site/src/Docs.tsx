import { useState } from "react";
import { parse, render } from "sugar-high/core";
import * as typescript from "sugar-high/lang/typescript";
import * as shell from "sugar-high/lang/shell";
import * as json from "sugar-high/lang/json";
import { examples, getExample, type AvatarState, type AvatarStateDefinition } from "open-bot-avatar";
import { GALLERY } from "./gallery";
import { SIGNATURE, defaultColor, type MaterialName } from "./studio/look";
import { RadioGroup } from "./studio/pickers";
import type { Choice } from "./studio/ui";
import { BotAvatar } from "./BotAvatar";
import { REPO } from "./route";
// The custom states the page shows are the code it runs: one module, read once as text.
import { asking, listening } from "./docs/states";
import STATES_SOURCE from "./docs/states.ts?raw";

const INSTALL = `pnpm add open-bot-avatar`;

const USAGE = `import { getExample } from "open-bot-avatar";
import { mountAvatar } from "open-bot-avatar/dom";

const avatar = mountAvatar(document.querySelector("#bot")!, {
  definition: getExample("mug")!,
  color: "#ff6a1a",
  followPointer: true,
});

avatar.update({ state: "working", mood: "happy" }); // any subset of the options
avatar.destroy();`;

const MATERIAL_USAGE = `import { mountAvatar } from "open-bot-avatar/dom";
import { glass } from "open-bot-avatar/materials/glass";

const avatar = mountAvatar(element, { definition, material: glass });
avatar.update({ material: "flat" });`;

/** The module as a reader would write it: without the exports the page needs, and put to use. */
const STATE_USAGE = `${STATES_SOURCE.replace(/^export /gm, "").trim()}

avatar.update({ state: asking });`;

/** The four finishes, in the order of the Studio's toggle, each with the import it needs. */
const MATERIALS: { name: MaterialName; label: string; text: string; code: string }[] = [
  { name: "flat", label: "Flat", text: "Solid color. The default, built in.", code: `// Built in. Nothing to import.` },
  { name: "fluffy", label: "Fluffy", text: "A coat of fur, with the eyes set into it.", code: `import { fluffy } from "open-bot-avatar/materials/fluffy";` },
  { name: "glass", label: "Glass", text: "Tinted glass that reflects and refracts.", code: `import { glass } from "open-bot-avatar/materials/glass";` },
  { name: "matte", label: "Matte", text: "Soft and shadowed like clay, with no shine.", code: `import { matte } from "open-bot-avatar/materials/matte";` },
];

const REACT_USAGE = `import { useEffect, useRef } from "react";
import { mountAvatar, type AvatarOptions, type MountedAvatar } from "open-bot-avatar/dom";

export function BotAvatar({ size = 96, ...options }: AvatarOptions & { size?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const avatar = useRef<MountedAvatar | null>(null);
  useEffect(() => {
    avatar.current = mountAvatar(host.current!, options);
    return () => avatar.current?.destroy();
  }, []);
  useEffect(() => avatar.current?.update(options));
  return <div ref={host} style={{ width: size, aspectRatio: "1" }} />;
}`;

const STILL_USAGE = `import { avatarFrame, renderAvatarSvg, validateAvatar } from "open-bot-avatar";

const result = validateAvatar(JSON.parse(json));
if (result.ok) {
  const svg = renderAvatarSvg(result.value, { color: "#1fbf68", size: 256 });
  const frame = avatarFrame(result.value, { color: "#1fbf68" });
}`;

const DEFINITION = `{
  "version": 1,
  "id": "box",
  "name": "Box",
  "body": { "path": "M20 20 H80 V80 H20 Z" },
  "eyes": { "x": 50, "y": 46, "spacing": 15, "scale": 1 }
}`;

const languages = { typescript, shell, json };
// These examples are constant; tokenize once when the Docs module loads.
const snippets = {
  install: render(parse(INSTALL, languages.shell)),
  usage: render(parse(USAGE, languages.typescript)),
  material: render(parse(MATERIAL_USAGE, languages.typescript)),
  state: render(parse(STATE_USAGE, languages.typescript)),
  react: render(parse(REACT_USAGE, languages.typescript)),
  still: render(parse(STILL_USAGE, languages.typescript)),
  definition: render(parse(DEFINITION, languages.json)),
};

const materialSnippets = MATERIALS.map((m) => render(parse(m.code, languages.typescript)));

function Code({ snippet, language }: { snippet: keyof typeof snippets; language: string }) {
  return (
    <pre className="code" tabIndex={0} aria-label={`${language} example`}>
      <code dangerouslySetInnerHTML={{ __html: snippets[snippet] }} />
    </pre>
  );
}

const PROPS: [string, string][] = [
  ["definition", "The avatar. Required."],
  ["color, eyeColor", "#rgb, #rrggbb or any CSS color. Default: #ff6a1a and #151515."],
  ["state", 'What the bot is doing: "idle" (default), "thinking", "working", "waiting", "blocked" or "done", or a state of your own (see Custom states).'],
  ["mood", 'How it feels: "neutral" (default) or "happy". It shapes the eyes on any state.'],
  ["followPointer", "Look at the mouse or finger. Default: false."],
  ["lookAt", "A fixed look direction, { x, y } from -1 to 1. Wins over the pointer."],
  ["holdGaze", "Keep looking where it looks now. Default: false."],
  ["view", "Extra rotation, { yaw, pitch } in radians."],
  ["depth", "Volume, 0 (flat) to 14. Default: 6."],
  ["reducedMotion", 'true, false or "system" (default).'],
  ["material", 'The body\'s finish: "flat" (default), or an imported material, fluffy, glass or matte (see Materials).'],
  ["still", "One fixed pose, no animation: an SVG, or one painted canvas for an imported material. Default: false."],
  ["renderer", '"canvas" (default) or "scene", a CSS 3D scene: more CPU, less video memory for one large avatar.'],
  ["label", 'Accessible name. Default: the definition\'s name; "" for decorative.'],
];

/** A random starter or gallery avatar in its own color, picked once per page load. */
const ALL = [...examples, ...GALLERY];
const PICK = ALL[Math.floor(Math.random() * ALL.length)];

/** The avatar of the mount example, for every preview: the same body and color in each finish. */
const MUG = getExample("mug")!;

/** One avatar in each finish, side by side. */
function MaterialRow({ state, size }: { state?: AvatarState | AvatarStateDefinition; size: "large" | "small" }) {
  return (
    <div className={`finishes finishes-${size}`}>
      {MATERIALS.map((m, i) => (
        <figure key={m.name} className="finish">
          <BotAvatar className="avatar-view finish-avatar" definition={MUG} color={SIGNATURE} material={m.name} state={state} followPointer label={`${MUG.name}, ${m.label.toLowerCase()}`} />
          <figcaption>
            <strong>{m.label}</strong>
            {size === "large" ? (
              <>
                <span className="finish-text">{m.text}</span>
                <pre className="code" tabIndex={0} aria-label={`${m.label}: TypeScript example`}>
                  <code dangerouslySetInnerHTML={{ __html: materialSnippets[i] }} />
                </pre>
              </>
            ) : null}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

type DemoState = "idle" | "asking" | "listening";
const DEMO_STATES: Choice<DemoState>[] = [
  { value: "idle", label: "idle", hint: "The built-in state" },
  { value: "asking", label: "asking", hint: "The body gives way to a question mark" },
  { value: "listening", label: "listening", hint: "Leaning, with narrowed eyes" },
];
const DEMO: Record<DemoState, AvatarState | AvatarStateDefinition> = { idle: "idle", asking, listening };

/** The two states of the example, live in each finish, with idle to change from and to. */
function CustomStates() {
  const [state, setState] = useState<DemoState>("asking");
  return (
    <div className="state-demo">
      <MaterialRow state={DEMO[state]} size="small" />
      <RadioGroup label="State" value={state} options={DEMO_STATES} onChange={setState} className="pills" itemClassName="pill" />
    </div>
  );
}

export function Docs({ material }: { material: MaterialName }) {
  return (
    <main className="page docs">
      <section className="page-head">
        <BotAvatar className="avatar-view docs-avatar" definition={PICK} material={material} color={defaultColor(PICK.id)} followPointer label="" />
        <h1>Docs</h1>
        <p className="lead">A JSON spec and renderer for interactive agent avatars.</p>
        <ul className="lead what">
          <li>Spec: one SVG path, and where the eyes sit.</li>
          <li>
            Renderer: the <code>open-bot-avatar</code> package, with no dependencies.
          </li>
          <li>
            <a href="#/">Editor</a>: pick, color, generate and import avatars.
          </li>
        </ul>
        <p className="lead">Open source, MIT licensed.</p>
      </section>

      <h2>Make an avatar</h2>
      <p>
        In the <a href="#/">editor</a>, describe it under Generate, send the prompt to any chat model or agent, and paste the JSON it{" "}
        returns into Import.
      </p>

      <h2>Definition</h2>
      <p>
        One path in a <code>0 0 100 100</code> box, and the eyes: their center, spacing and scale. Check any definition you didn't{" "}
        write with <code>validateAvatar</code>. The rules are in the{" "}
        <a href={`${REPO}/blob/main/docs/avatar-contract.md`}>contract</a>.
      </p>
      <Code snippet="definition" language="JSON" />

      <h2>Install</h2>
      <Code snippet="install" language="Shell" />

      <h2>Mount an avatar</h2>
      <p>
        <code>mountAvatar</code> fills a square element with a live avatar. <code>update</code> changes options,{" "}
        <code>destroy</code> removes it.
      </p>
      <Code snippet="usage" language="TypeScript" />
      <table className="props">
        <caption>Options</caption>
        <tbody>
          {PROPS.map(([name, text]) => (
            <tr key={name}>
              <th scope="row"><code>{name}</code></th>
              <td>{text}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Materials</h2>
      <p>
        A material is the body's finish. There are four, shown here live on the avatar from the example above.
      </p>
      <MaterialRow size="large" />
      <p>
        Mounting ships the flat renderer only. A material is a value you import and pass as <code>material</code>, so a bundler
        leaves out the ones you don't use.
      </p>
      <Code snippet="material" language="TypeScript" />
      <ul className="notes">
        <li>
          Fluffy, glass and matte need the canvas renderer and WebGL2, and draw flat without them. <code>renderer: "scene"</code>{" "}
          and <code>renderAvatarSvg</code> always draw flat.
        </li>
        <li>
          A material is a value, not a name. <code>material: "fluffy"</code>, as it was written before, draws flat and logs one
          warning that names the import. Keep names in storage and links, and map them to the imported values where you render.
        </li>
        <li>
          Writing a material of your own (the <code>CanvasMaterial</code> type) is experimental and may change in a minor
          release.
        </li>
      </ul>

      <h2>
        Custom states <small>Experimental</small>
      </h2>
      <p>
        The six state names are one vocabulary. If your bot has a status they don't cover, pass a definition instead of a name: an{" "}
        <code>id</code> and a <code>pose</code> function that returns what differs from the resting pose. A pose can name a mark the
        body gives way to: an <code>id</code> and the outlines it is made of. Every material draws a mark in its own shape.
      </p>
      <CustomStates />
      <Code snippet="state" language="TypeScript" />
      <p>
        States and marks of your own are written against the renderer's own model of a pose, so their fields may be renamed or
        removed in a minor release. The six names are stable. The{" "}
        <a href={`${REPO}/tree/main/packages/core#custom-states`}>package README</a> has the details.
      </p>

      <h2>SVG</h2>
      <p>
        <code>renderAvatarSvg</code> returns an SVG string, with no DOM needed. <code>avatarFrame</code> returns the same frame as{" "}
        data, for drawing it yourself.
      </p>
      <Code snippet="still" language="TypeScript" />

      <h2>React</h2>
      <p>There's no React package; this component is all you need. Other frameworks work the same way.</p>
      <Code snippet="react" language="TSX" />
    </main>
  );
}
