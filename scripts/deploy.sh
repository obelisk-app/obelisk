#!/usr/bin/env bash
# Production deploy: install, test, build, pm2 restart, health check.
#
#   ./scripts/deploy.sh           - build and restart
#   ./scripts/deploy.sh --pull    - git pull first, then build and restart
#   SKIP_BUILD=1 ./scripts/deploy.sh - skip build (just restart)
#   SKIP_TESTS=1 ./scripts/deploy.sh - skip the test run before the build
#
# Env overrides:
#   PM2_APP   default: obelisk-dex
#   PORT      default: 3001  (what the health check probes; ecosystem.config.js
#                             reads the same variable)
#
# Failure model. `set -euo pipefail` stops the script at the first failing
# command, so a red test or build never reaches the restart. Everything up to
# and including the build leaves the old server process running; the one
# thing that is not isolated is `next build` writing into the same .next/
# the live server reads from, which is noted at the build step.
#
# The tunnel (obelisk-dex-tunnel) is NOT restarted; it doesn't need to be.

set -euo pipefail

cd "$(dirname "$0")/.." || exit 1

red()   { printf "\033[0;31m%s\033[0m\n" "$*"; }
green() { printf "\033[0;32m%s\033[0m\n" "$*"; }
blue()  { printf "\033[0;34m%s\033[0m\n" "$*"; }
step()  { printf "\n\033[1;36m▸ %s\033[0m\n" "$*"; }

SKIP_BUILD="${SKIP_BUILD:-0}"
SKIP_TESTS="${SKIP_TESTS:-0}"
PM2_APP="${PM2_APP:-obelisk-dex}"
PORT="${PORT:-3001}"

# ── Pre-flight ───────────────────────────────────────────────────
step "Pre-flight"
for tool in node npm pm2 curl; do
  command -v "$tool" >/dev/null || { red "$tool not installed."; exit 1; }
done
# `pm2 id` prints `[ <n> ]` for a known app and `[]` otherwise. Captured
# into a variable rather than piped to `grep -q`: under pipefail a grep that
# exits early can hand the writer SIGPIPE and turn a match into a failure.
pm2_ids=$(pm2 id "$PM2_APP" 2>/dev/null || true)
case "$pm2_ids" in
  *[0-9]*) ;;
  *) red "pm2 does not know '$PM2_APP'. Start it once with: pm2 start ecosystem.config.js"; exit 1 ;;
esac
green "OK."

# ── Optional git pull ────────────────────────────────────────────
if [ "${1:-}" = "--pull" ]; then
  step "Git pull"
  git pull --ff-only
  green "Up to date."
fi

# ── Install deps ─────────────────────────────────────────────────
# `npm install`, not `npm ci`, on purpose: `npm ci` deletes node_modules
# before reinstalling, and the live `next start` process lazy-loads from
# that directory, so a wipe would break production before the new build
# exists. `npm install` edits in place. The price is that a lockfile out of
# step with package.json would resolve fresh versions and rewrite the lock
# silently, so the lockfile is checked for drift right after.
step "Install dependencies"
npm install --prefer-offline --no-audit --no-fund
if git rev-parse --is-inside-work-tree >/dev/null 2>&1 \
   && ! git diff --quiet -- package-lock.json; then
  red "npm install rewrote package-lock.json: the committed lockfile did not match package.json."
  red "Production would now run versions that were never tested. Commit a correct lockfile and redeploy."
  git --no-pager diff --stat -- package-lock.json
  exit 1
fi
green "Done."

# ── Test ─────────────────────────────────────────────────────────
step "Test"
if [ "$SKIP_TESTS" = "1" ]; then
  blue "Skipped (SKIP_TESTS=1)."
else
  blue "Running vitest…"
  npm test
  green "Tests passed."
fi

# ── Build ────────────────────────────────────────────────────────
# `next build` writes into .next/ while the old process is still serving
# from it. During the build a request can land on a half-written manifest.
# The window is the build time; a failed build leaves a broken .next/ that
# the old process may also trip over, which is why the restart below is not
# conditional on anything after this point: if the build fails we stop here
# and the operator decides. Building elsewhere and swapping is the fix, but
# that is a server-layout change, not a script change.
step "Build"
if [ "$SKIP_BUILD" = "1" ]; then
  [ -d .next ] || { red ".next/ missing; cannot skip build."; exit 1; }
  blue "Skipped (SKIP_BUILD=1)."
else
  blue "Running next build…"
  npm run build
  green "Build complete."
fi

# ── Restart app ──────────────────────────────────────────────────
step "Restart $PM2_APP"
pm2 restart "$PM2_APP"
green "Restart issued."

# ── Health check ─────────────────────────────────────────────────
# "pm2 says online" only means the process exists. Wait for the server to
# answer an actual HTTP request before calling the deploy done, and fail the
# script if it never does, with the recent log so the cause is on screen.
step "Health check"
code="000"
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "http://127.0.0.1:${PORT}/" || true)
  case "$code" in
    2*|3*) green "Serving on 127.0.0.1:${PORT} (HTTP ${code} after ${i}s)."; break ;;
  esac
  sleep 1
done
case "$code" in
  2*|3*) ;;
  *)
    red "$PM2_APP did not answer on 127.0.0.1:${PORT} within 60s (last HTTP code: ${code})."
    red "The old build is gone; fix forward. Recent log:"
    pm2 logs "$PM2_APP" --lines 30 --nostream 2>/dev/null || true
    exit 1
    ;;
esac

step "Done"
green "Deployed. Check status: pm2 status"
