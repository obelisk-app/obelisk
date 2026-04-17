#!/usr/bin/env bash
# One-shot dev + Cloudflare tunnel launcher for Obelisk.
#
#   ./scripts/dev-tunnel.sh
#
# Starts `npm run dev` and a named cloudflared tunnel that exposes
# https://obelisk.fabri.lat -> https://127.0.0.1:3000.
#
# Requirements (one-time):
#   brew install cloudflared
#   cloudflared tunnel login                          # creates ~/.cloudflared/cert.pem
#   cloudflared tunnel create obelisk                 # creates the named tunnel
#   cloudflared tunnel route dns --overwrite-dns \
#     <tunnel-uuid> obelisk.fabri.lat                 # CNAME -> tunnel
#
# The script auto-discovers the tunnel UUID by name, so no hard-coded ID.

set -u

TUNNEL_NAME="${TUNNEL_NAME:-obelisk}"
HOSTNAME="${TUNNEL_HOSTNAME:-obelisk.fabri.lat}"
PORT="${PORT:-3000}"
ORIGIN_URL="${ORIGIN_URL:-https://127.0.0.1:${PORT}}"  # server.ts uses HTTPS when cert.pem exists

cd "$(dirname "$0")/.."

red()   { printf "\033[0;31m%s\033[0m\n" "$*"; }
green() { printf "\033[0;32m%s\033[0m\n" "$*"; }
blue()  { printf "\033[0;34m%s\033[0m\n" "$*"; }

# ── Pre-flight checks ────────────────────────────────────────────
command -v cloudflared >/dev/null || { red "cloudflared not installed. brew install cloudflared"; exit 1; }
[ -f ~/.cloudflared/cert.pem ] || { red "Not logged in. Run: cloudflared tunnel login"; exit 1; }

TUNNEL_UUID=$(cloudflared tunnel list 2>/dev/null | awk -v n="$TUNNEL_NAME" '$2==n {print $1}')
if [ -z "$TUNNEL_UUID" ]; then
  red "Tunnel '$TUNNEL_NAME' not found."
  echo "Create it with:"
  echo "  cloudflared tunnel create $TUNNEL_NAME"
  echo "  cloudflared tunnel route dns --overwrite-dns $TUNNEL_NAME $HOSTNAME"
  exit 1
fi
CRED_FILE="$HOME/.cloudflared/${TUNNEL_UUID}.json"
[ -f "$CRED_FILE" ] || { red "Missing credentials file: $CRED_FILE"; exit 1; }

# ── Free port 3000 ───────────────────────────────────────────────
ensure_port_free() {
  local pids
  pids=$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)
  if [ -z "$pids" ]; then return 0; fi

  blue "Port $PORT is already in use by PID(s): $pids"
  for pid in $pids; do
    ps -p "$pid" -o pid=,command= 2>/dev/null || true
  done
  if [ -t 0 ]; then
    printf "Kill them and continue? [y/N] "
    read -r ans
  else
    blue "Non-interactive stdin — auto-killing."
    ans=y
  fi
  case "$ans" in
    y|Y|yes|YES)
      kill $pids 2>/dev/null || true
      sleep 1
      pids=$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)
      if [ -n "$pids" ]; then
        red "Process(es) didn't exit, force-killing: $pids"
        kill -9 $pids 2>/dev/null || true
        sleep 1
      fi
      pids=$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)
      if [ -n "$pids" ]; then
        red "Port $PORT still in use. Aborting."
        exit 1
      fi
      green "Port $PORT freed."
      ;;
    *)
      red "Aborting — free port $PORT and retry."
      exit 1
      ;;
  esac
}
ensure_port_free

# ── Launch dev + tunnel ──────────────────────────────────────────
DEV_PID=""
TUNNEL_PID=""
cleanup() {
  echo
  blue "Shutting down…"
  [ -n "$TUNNEL_PID" ] && kill "$TUNNEL_PID" 2>/dev/null || true
  [ -n "$DEV_PID" ]    && kill "$DEV_PID"    2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

green "Starting npm run dev (logs → ./dev.log)…"
npm run dev > dev.log 2>&1 &
DEV_PID=$!

# Wait for the dev server to start listening on $PORT.
blue "Waiting for dev server on port ${PORT}…"
for i in $(seq 1 60); do
  if lsof -iTCP:"$PORT" -sTCP:LISTEN -n -P >/dev/null 2>&1; then
    green "Dev server up."
    break
  fi
  if ! kill -0 "$DEV_PID" 2>/dev/null; then
    red "npm run dev died early. Last log lines:"
    tail -20 dev.log
    exit 1
  fi
  sleep 1
done

if ! lsof -iTCP:"$PORT" -sTCP:LISTEN -n -P >/dev/null 2>&1; then
  red "Dev server didn't start within 60s. See dev.log"
  exit 1
fi

green "Starting cloudflared tunnel '$TUNNEL_NAME' → $ORIGIN_URL"
green "Public URL: https://$HOSTNAME"
cloudflared tunnel \
  --config /dev/null \
  --cred-file "$CRED_FILE" \
  run \
  --url "$ORIGIN_URL" \
  --no-tls-verify \
  "$TUNNEL_UUID" &
TUNNEL_PID=$!

# Block until either child exits (bash 3.2 compatible — no `wait -n`).
while kill -0 "$DEV_PID" 2>/dev/null && kill -0 "$TUNNEL_PID" 2>/dev/null; do
  sleep 1
done
