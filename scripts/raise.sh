#!/usr/bin/env bash
# Production raise: `next build` + `next start` + Cloudflare tunnel.
#
# Same idempotent shape as dev-raise.sh but runs the production server.
#
#   ./scripts/raise.sh
#
# Env overrides:
#   TUNNEL_NAME       default: obelisk-dex
#   TUNNEL_HOSTNAME   default: obelisk.ar  (apex; dex.obelisk.ar must also route to this tunnel for the in-app 308 redirect to fire)
#   PORT              default: 3001  (3000 is reserved for classic.obelisk.ar)
#   ORIGIN_URL        default: http://127.0.0.1:$PORT
#   SKIP_BUILD=1      reuse existing .next/
#   SKIP_TUNNEL=1     skip cloudflared
#   FORCE_KILL=1      kill anything on $PORT instead of failing

set -u

if [ -f "$(dirname "$0")/../.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$(dirname "$0")/../.env"
  set +a
fi

TUNNEL_NAME="${TUNNEL_NAME:-obelisk-dex}"
TUNNEL_HOST="${TUNNEL_HOSTNAME:-obelisk.ar}"
TUNNEL_HOST_LEGACY="${TUNNEL_HOST_LEGACY:-dex.obelisk.ar}"
PORT="${PORT:-3001}"
ORIGIN_URL="${ORIGIN_URL:-http://127.0.0.1:${PORT}}"
SKIP_BUILD="${SKIP_BUILD:-0}"
SKIP_TUNNEL="${SKIP_TUNNEL:-0}"
FORCE_KILL="${FORCE_KILL:-0}"

cd "$(dirname "$0")/.."

red()   { printf "\033[0;31m%s\033[0m\n" "$*"; }
green() { printf "\033[0;32m%s\033[0m\n" "$*"; }
blue()  { printf "\033[0;34m%s\033[0m\n" "$*"; }
dim()   { printf "\033[2m%s\033[0m\n"     "$*"; }
step()  { printf "\n\033[1;36m▸ %s\033[0m\n" "$*"; }

# ── Pre-flight ───────────────────────────────────────────────────
step "Pre-flight"
command -v node >/dev/null || { red "node not installed."; exit 1; }
command -v npm  >/dev/null || { red "npm not installed."; exit 1; }
if [ "$SKIP_TUNNEL" != "1" ]; then
  command -v cloudflared >/dev/null || { red "cloudflared not installed."; exit 1; }
  [ -f "$HOME/.cloudflared/cert.pem" ] || { red "cloudflared not logged in."; exit 1; }
fi
green "OK."

# ── Tunnel lookup ────────────────────────────────────────────────
TUNNEL_UUID=""
CRED_FILE=""
if [ "$SKIP_TUNNEL" != "1" ]; then
  step "Tunnel lookup"
  TUNNEL_UUID=$(cloudflared tunnel list 2>/dev/null | awk -v n="$TUNNEL_NAME" '$2==n {print $1}')
  if [ -z "$TUNNEL_UUID" ]; then
    red "Tunnel '$TUNNEL_NAME' not found."
    echo "  cloudflared tunnel create $TUNNEL_NAME"
    echo "  cloudflared tunnel route dns --overwrite-dns $TUNNEL_NAME $TUNNEL_HOST"
    echo "  cloudflared tunnel route dns --overwrite-dns $TUNNEL_NAME $TUNNEL_HOST_LEGACY"
    exit 1
  fi
  CRED_FILE="$HOME/.cloudflared/${TUNNEL_UUID}.json"
  [ -f "$CRED_FILE" ] || { red "Missing credentials: $CRED_FILE"; exit 1; }
  dim "UUID: $TUNNEL_UUID  →  $TUNNEL_HOST  (legacy: $TUNNEL_HOST_LEGACY → 308 → $TUNNEL_HOST)"
fi

# ── Build ────────────────────────────────────────────────────────
step "Build"
if [ "$SKIP_BUILD" = "1" ]; then
  [ -d .next ] || { red ".next/ missing — can't SKIP_BUILD."; exit 1; }
  dim "skipped (SKIP_BUILD=1)"
else
  blue "next build…"
  if ! npx next build; then red "build failed."; exit 1; fi
  green "Build complete."
fi

# ── Port check ───────────────────────────────────────────────────
step "Production server on port $PORT"
pids=$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)
if [ -n "$pids" ]; then
  cmd=$(ps -p "$(echo "$pids" | head -1)" -o command= 2>/dev/null || true)
  blue "Port $PORT held by: $cmd"
  if [ "$FORCE_KILL" = "1" ]; then
    blue "FORCE_KILL=1 — killing."
    kill $pids 2>/dev/null || true; sleep 1
    still=$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)
    [ -n "$still" ] && { kill -9 $still 2>/dev/null || true; sleep 1; }
  else
    red "Port $PORT in use. Free it or set FORCE_KILL=1."; exit 1
  fi
fi

# ── Launch ───────────────────────────────────────────────────────
APP_PID=""
TUNNEL_PID=""

cleanup() {
  echo
  blue "Shutting down…"
  [ -n "$TUNNEL_PID" ] && kill "$TUNNEL_PID" 2>/dev/null || true
  [ -n "$APP_PID" ]    && kill "$APP_PID"    2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

blue "Starting next start on :$PORT (logs → ./app.log)…"
PORT="$PORT" npx next start -p "$PORT" > app.log 2>&1 &
APP_PID=$!
for i in $(seq 1 60); do
  lsof -iTCP:"$PORT" -sTCP:LISTEN -n -P >/dev/null 2>&1 && { green "App up."; break; }
  if ! kill -0 "$APP_PID" 2>/dev/null; then
    red "next start died. Last 20 log lines:"; tail -20 app.log; exit 1
  fi
  sleep 1
done
lsof -iTCP:"$PORT" -sTCP:LISTEN -n -P >/dev/null 2>&1 || { red "App didn't start within 60s. See app.log"; exit 1; }

if [ "$SKIP_TUNNEL" = "1" ]; then
  step "Ready"
  green "App: http://127.0.0.1:$PORT  (SKIP_TUNNEL=1)"
  while kill -0 "$APP_PID" 2>/dev/null; do sleep 5; done
  exit 0
fi

step "Cloudflare tunnel"
if pgrep -f "cloudflared .* ${TUNNEL_UUID}" >/dev/null 2>&1 \
   || pgrep -f "cloudflared .* ${TUNNEL_NAME}\b" >/dev/null 2>&1; then
  green "Tunnel '$TUNNEL_NAME' already running — reusing."
  TUNNEL_REUSED=1
else
  blue "Starting cloudflared '$TUNNEL_NAME' → $ORIGIN_URL (logs → ./tunnel.log)"
  cloudflared tunnel \
    --config /dev/null \
    --cred-file "$CRED_FILE" \
    run \
    --url "$ORIGIN_URL" \
    --no-tls-verify \
    "$TUNNEL_UUID" > tunnel.log 2>&1 &
  TUNNEL_PID=$!
  sleep 2
  if ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
    red "cloudflared died. Last 20 log lines:"; tail -20 tunnel.log; exit 1
  fi
fi

step "Raised"
green "Local:    http://127.0.0.1:$PORT"
green "Public:   https://$TUNNEL_HOST"
green "Legacy:   https://$TUNNEL_HOST_LEGACY  (308 → https://$TUNNEL_HOST)"
dim   "Logs:   ./app.log  ./tunnel.log"
echo

while :; do
  [ -n "$TUNNEL_PID" ] && ! kill -0 "$TUNNEL_PID" 2>/dev/null && { red "Tunnel exited."; break; }
  ! kill -0 "$APP_PID" 2>/dev/null && { red "App exited."; break; }
  sleep 2
done
