#!/usr/bin/env sh
# Validate an avatar definition with the repo engine.
#   validate.sh <file.json|-> [--strict] [--svg out.svg] [--color #hex] [--motion idle|thinking|happy] [--time s]
# Resolves the repo through symlinked installs; override with AVATAR_REPO=/path/to/open-bot-avatar.
set -eu
here=$(dirname "$(readlink -f "$0")")
repo=${AVATAR_REPO:-$(cd "$here/../../.." && pwd)}
if [ ! -f "$repo/packages/core/scripts/avatar-validate.ts" ]; then
  echo "error: avatar engine not found at $repo; set AVATAR_REPO to the open-bot-avatar checkout" >&2
  exit 2
fi
exec node "$repo/packages/core/scripts/avatar-validate.ts" "$@"
