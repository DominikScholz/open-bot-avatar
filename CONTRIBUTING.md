# Contributing

Open Bot Avatar is open source, and contributions are welcome. They are MIT licensed, like the rest of the repository.

## What to send

- **An avatar for the gallery.** The steps are in the [gallery README](gallery/README.md#adding-one).
- **A bug fix.** A small fix for an obvious bug needs no issue. For a larger one, link the issue that shows the bug.
- **A feature.** Open an issue first and say what you want to build. A feature nobody agreed to may be closed, however good the code is.

Search the open pull requests before you start. If one covers your change, test it and comment with what you saw.

## Rules for a pull request

### One problem per pull request

Fix one problem. Include every change it needs: code, tests and docs. Cleanup, refactors and a second fix go in their own pull requests.

### Conventional Commits

Commit messages and pull request titles follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/). Pull requests are squash-merged, so the title becomes the commit on `main`.

```text
type(scope): summary
```

- **Type:** `feat`, `fix`, `docs`, `perf`, `refactor`, `test`, `build`, `ci` or `chore`.
- **Scope:** optional. One of `core` (the npm package), `site`, `gallery` or `skills`.
- **Summary:** what changes for the person using it, in the imperative, without a period.
- **Breaking change:** put `!` before the colon and say what breaks in the description.

```text
feat(core): add a glass material
fix(site): keep the import path on one line in the docs
feat(gallery): add egg
docs: describe custom states
```

### Show that it works

Say what you changed, how you checked it and what you saw. "Tests pass" is not evidence.

A change you can see needs a screenshot, or a short video when it is about motion. Upload them to the pull request. Do not commit them.

### Checks and changesets

Run `pnpm check` before you open the pull request. CI runs the same typecheck, tests and build.

A change to the published package (`packages/core`, its README included) needs a changeset: run `pnpm changeset` and commit the file it writes. A change to the site, the gallery or the docs alone needs none.

## Setup

Needs Node 22.18+ and pnpm.

```sh
pnpm install
pnpm dev          # the site, with the package from source
pnpm check        # typecheck, tests and build, in sequence
```

The [README](README.md#development) lists the other commands.
