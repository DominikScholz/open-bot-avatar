import { examples, validateAvatar, type AvatarDefinition } from "open-bot-avatar";

/**
 * The gallery: every definition in the repo's gallery/ folder, one JSON file each, checked with
 * the engine's validator like any import (CI runs the same check strictly). The starters that
 * ship with the package are listed separately; a gallery file can't shadow one of them.
 */
const files = import.meta.glob<unknown>(["../../../gallery/*.json", "!../../../gallery/colors.json"], { eager: true, import: "default" });

export const GALLERY: AvatarDefinition[] = Object.entries(files)
  .flatMap(([path, raw]) => {
    const result = validateAvatar(raw);
    if (!result.ok) {
      console.warn(`Skipping ${path}: ${result.errors.join("; ")}`);
      return [];
    }
    return examples.some((e) => e.id === result.value.id) ? [] : [result.value];
  })
  .sort((a, b) => a.name.localeCompare(b.name));

export function findGallery(id: string): AvatarDefinition | undefined {
  return GALLERY.find((d) => d.id === id);
}
