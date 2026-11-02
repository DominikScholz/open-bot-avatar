import { renderAvatarSvg, type AvatarDefinition } from "open-bot-avatar";

/** Gap between silhouette and ring, and the ring's width, in viewBox units (a thumbnail is ~50-65px for 100 units). */
const GAP = 7;
const LINE = 2.2;

/**
 * Pose of every picker thumbnail: turned a little to the right, tipped up and looking up
 * and to the right, so the whole grid faces one way. The ring uses it too.
 */
export const THUMB_VIEW = { yaw: 0.5, pitch: 0.12 };
export const THUMB_LOOK = { x: 0.7, y: -1 };

const cache = new Map<string, string>();

/**
 * Selection ring for a thumbnail: an SVG with the same viewBox and resting pose
 * as the still, drawn from the still's own projected cross-sections (eyes left
 * out). Their union, filled and stroked with round joins, grows evenly; masking
 * out a smaller growth leaves a thin ring that hugs the whole silhouette, and
 * small holes simply fill in. Painted in currentColor. Color-independent and
 * memoized; "" if the definition can't be rendered.
 */
export function outlineSvg(definition: AvatarDefinition): string {
  const key = JSON.stringify([definition?.id, definition?.body?.path, definition?.eyes]);
  let markup = cache.get(key);
  if (markup === undefined) {
    markup = build(definition);
    if (cache.size >= 64) cache.delete(cache.keys().next().value as string);
    cache.set(key, markup);
  }
  return markup;
}

function build(definition: AvatarDefinition): string {
  let svg: string;
  try {
    // The options an AvatarView still uses, minus color.
    svg = renderAvatarSvg(definition, { motion: "idle", time: 0, reducedMotion: true, view: THUMB_VIEW, gaze: THUMB_LOOK });
  } catch {
    return "";
  }
  const defs = /<defs>(.*?)<\/defs>/s.exec(svg)?.[1];
  const root = /<\/defs><g transform="([^"]*)"/.exec(svg)?.[1];
  const uses = svg.slice(svg.indexOf("</defs>")).match(/<use [^>]*\/>/g);
  const first = defs && /id="([^"]+)"/.exec(defs)?.[1];
  if (!defs || !root || !uses || !first) return "";
  // Own ids, so the ring never depends on the thumbnail's markup.
  const own = (s: string) => s.replace(/(id="|href="#)([^"]+)"/g, '$1$2-ring"');
  const mask = `${first}-ring-mask`;
  const slices = own(uses.join(""));
  const grown = (paint: string, by: number) =>
    `<g transform="${root}" fill="${paint}" stroke="${paint}" stroke-width="${2 * by}" stroke-linejoin="round">${slices}</g>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" overflow="visible" aria-hidden="true" focusable="false">` +
    `<defs>${own(defs)}<mask id="${mask}" maskUnits="userSpaceOnUse" x="-20" y="-20" width="140" height="140">` +
    `<rect x="-20" y="-20" width="140" height="140" fill="white"/>${grown("black", GAP)}</mask></defs>` +
    `<g mask="url(#${mask})">${grown("currentColor", GAP + LINE)}</g></svg>`
  );
}
