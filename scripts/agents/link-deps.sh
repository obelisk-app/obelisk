#!/usr/bin/env bash
# Give an agent worktree the canonical checkout's node_modules instead of a
# fresh install: one install for every agent, seconds instead of minutes.
#
#   bash scripts/agents/link-deps.sh            # from inside the worktree
#
# Links only when the worktree's package-lock.json matches the canonical
# checkout's. When it differs (the task changes dependencies), it says so and
# installs locally instead. Never run `npm ci` / `npm install` while
# node_modules is a link: that would rewrite the shared install under every
# other agent. Remove the link first (`rm node_modules`), then install.
set -euo pipefail

here="$(git rev-parse --show-toplevel)"
canonical="$(git -C "$here" worktree list --porcelain | awk '/^worktree /{print $2; exit}')"

if [ "$here" = "$canonical" ]; then
  echo "This is the canonical checkout; it owns node_modules. Nothing to link."
  exit 0
fi
if [ ! -d "$canonical/node_modules" ]; then
  echo "The canonical checkout has no node_modules; run npm ci there first." >&2
  exit 1
fi
if ! cmp -s "$here/package-lock.json" "$canonical/package-lock.json"; then
  echo "package-lock.json differs from the canonical checkout: installing locally."
  [ -L "$here/node_modules" ] && rm "$here/node_modules"
  (cd "$here" && npm ci)
  exit 0
fi
if [ -L "$here/node_modules" ]; then
  echo "node_modules is already linked to $(readlink "$here/node_modules")."
  exit 0
fi
if [ -e "$here/node_modules" ]; then
  echo "node_modules exists as a real folder here; leaving it." >&2
  exit 0
fi
ln -s "$canonical/node_modules" "$here/node_modules"
echo "Linked node_modules -> $canonical/node_modules"
