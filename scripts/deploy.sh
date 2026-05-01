#!/usr/bin/env bash
# Production deploy: build + pm2 restart.
#
#   ./scripts/deploy.sh           — build and restart
#   ./scripts/deploy.sh --pull    — git pull first, then build and restart
#   SKIP_BUILD=1 ./scripts/deploy.sh — skip build (just restart)
#
# The tunnel (obelisk-dex-tunnel) is NOT restarted — it doesn't need to be.

set -euo pipefail

cd "$(dirname "$0")/.."

red()   { printf "\033[0;31m%s\033[0m\n" "$*"; }
green() { printf "\033[0;32m%s\033[0m\n" "$*"; }
blue()  { printf "\033[0;34m%s\033[0m\n" "$*"; }
step()  { printf "\n\033[1;36m▸ %s\033[0m\n" "$*"; }

SKIP_BUILD="${SKIP_BUILD:-0}"

# ── Optional git pull ────────────────────────────────────────────
if [ "${1:-}" = "--pull" ]; then
  step "Git pull"
  git pull --ff-only
  green "Up to date."
fi

# ── Install deps ─────────────────────────────────────────────────
step "Install dependencies"
npm install --prefer-offline
green "Done."

# ── Build ────────────────────────────────────────────────────────
step "Build"
if [ "$SKIP_BUILD" = "1" ]; then
  [ -d .next ] || { red ".next/ missing — cannot skip build."; exit 1; }
  blue "Skipped (SKIP_BUILD=1)."
else
  blue "Running next build…"
  npm run build
  green "Build complete."
fi

# ── Restart app ──────────────────────────────────────────────────
step "Restart obelisk-dex"
pm2 restart obelisk-dex
green "Restarted."

step "Done"
green "Deployed. Check status: pm2 status"
