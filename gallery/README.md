# Gallery

Ready-made avatars, listed in the [editor](https://dominikscholz.github.io/open-bot-avatar/)'s picker next to the starters. Each file is one avatar definition (see [docs/avatar-contract.md](../docs/avatar-contract.md)), named after its id: `gallery/<id>.json`. Definitions are geometry only; each avatar's default color is listed in `colors.json`.

## Adding one

1. Make an avatar in the [editor](https://dominikscholz.github.io/open-bot-avatar/) (*Generate*, then *Import*), or with the `generate-avatar` skill.
2. Copy its JSON (*Copy → JSON* under the avatar) into `gallery/<id>.json`, pretty-printed.
3. Check it strictly, from the repo root:

   ```sh
   node packages/core/scripts/avatar-validate.ts --strict gallery/<id>.json --svg /tmp/<id>.svg
   ```

4. Give it its own color in [`colors.json`](colors.json), by id: one of the editor's swatches (see `PALETTE` in `apps/site/src/studio/look.ts`) or any `#rrggbb`. The editor shows it in that color until someone picks another.
5. Open a pull request. CI runs the same strict check (`pnpm test`) and checks that every avatar has a color; the id must be new and must not reuse a built-in example's id (controller, barbell, mug, lightbulb, chat, sprout, watering-can).

Keep it to objects and roles: a recognizable silhouette that reads at 28 px, with the face on the biggest part. Contributions are MIT licensed like the rest of the repo.
