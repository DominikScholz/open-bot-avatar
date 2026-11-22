import type { AvatarDefinition, AvatarMaterial } from "open-bot-avatar";
import { BotAvatar } from "../BotAvatar";
import { thumbnailKey, THUMB_LOOK, THUMB_VIEW } from "./outline";
import keys from "./plush-thumbnails.json";
import atlas from "./plush-thumbnails.webp";

// The atlas is a square grid of cells, one per key, in the order of the list.
const cells = new Map(keys.map((key, index) => [key, index]));
const side = Math.ceil(Math.sqrt(keys.length));

/**
 * A picker thumbnail: a still of the avatar in its color. A flat still is one small SVG. A plush
 * one has to build the avatar's mesh and render it, so the avatars the site ships with come from
 * a baked image in their own colors, and only another color or one of yours is rendered here.
 * Bake it again after a change to how plush looks: pnpm --filter site thumbnails.
 */
export function AvatarThumbnail({ definition, color, material }: { definition: AvatarDefinition; color: string; material: AvatarMaterial }) {
  const cell = material === "plush" ? cells.get(thumbnailKey(definition, color)) : undefined;
  if (cell === undefined) {
    return <BotAvatar className="avatar-view" definition={definition} color={color} material={material} still view={THUMB_VIEW} lookAt={THUMB_LOOK} label="" />;
  }
  // Background positions in percent run from the first cell (0%) to the last (100%).
  const step = 100 / Math.max(1, side - 1);
  return (
    <span
      className="avatar-view"
      aria-hidden="true"
      style={{
        backgroundImage: `url("${atlas}")`,
        backgroundSize: `${side * 100}% ${side * 100}%`,
        backgroundPosition: `${(cell % side) * step}% ${Math.floor(cell / side) * step}%`,
      }}
    />
  );
}
