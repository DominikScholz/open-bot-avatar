import type { AvatarDefinition } from "open-bot-avatar";
import type { AvatarMaterial } from "open-bot-avatar/dom";
import { BotAvatar } from "../BotAvatar";
import { thumbnailKey, THUMB_LOOK, THUMB_VIEW } from "./outline";
import keys from "./plush-thumbnails.json";
import atlas from "./plush-thumbnails.webp";

// Rebuild after a shader change with pnpm --filter site thumbnails. A new shape or dye renders on demand.
const cells = new Map(keys.map((key, index) => [key, index]));
const side = Math.ceil(Math.sqrt(keys.length));

export function AvatarThumbnail({ definition, color, material }: { definition: AvatarDefinition; color: string; material: AvatarMaterial }) {
  const cell = material === "plush" ? cells.get(thumbnailKey(definition, color)) : undefined;
  if (cell !== undefined) {
    const step = 100 / Math.max(1, side - 1);
    return <span className="avatar-view" aria-hidden="true" style={{
      backgroundImage: `url("${atlas}")`, backgroundSize: `${side * 100}% ${side * 100}%`,
      backgroundPosition: `${(cell % side) * step}% ${Math.floor(cell / side) * step}%`,
    }} />;
  }
  return <BotAvatar className="avatar-view" definition={definition} color={color} material={material} still view={THUMB_VIEW} lookAt={THUMB_LOOK} label="" />;
}
