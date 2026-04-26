#!/usr/bin/env bash
# One-shot dev raise: Docker + db + dev server + Cloudflare tunnel.
#
# Idempotent: starts Docker (Colima/OrbStack/Desktop), Postgres + LiveKit,
# Next.js dev server, and the named cloudflared tunnel only if each piece
# isn't already running. Re-running is safe and cheap.
#
# Cloudflared output is redirected to ./tunnel.log (kept off stdout).
#
#   ./scripts/dev-raise.sh
#
# Env overrides:
#   TUNNEL_NAME        default: obelisk
#   TUNNEL_HOSTNAME    default: obelisk.fabri.lat
#   PORT               default: 3000
#   ORIGIN_URL         default: https://127.0.0.1:$PORT
#   SKIP_LIVEKIT=1     don't bring up livekit container
#   SKIP_TUNNEL=1      only start db + dev server, no cloudflared
#   FORCE_KILL=1       non-interactive: kill unknown processes on $PORT

set -u

# Load project .env so TUNNEL_HOSTNAME / DATABASE_URL / etc. don't have
# to be re-typed on every invocation. Existing shell vars take precedence.
if [ -f "$(dirname "$0")/../.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$(dirname "$0")/../.env"
  set +a
fi

TUNNEL_NAME="${TUNNEL_NAME:-obelisk}"
TUNNEL_HOST="${TUNNEL_HOSTNAME:-obelisk.fabri.lat}"
PORT="${PORT:-3000}"
# server.ts switches to HTTPS only when both cert.pem + key.pem exist in
# the project root. Auto-pick the matching origin scheme so cloudflared
# doesn't try to TLS-handshake an HTTP server (or vice-versa). Override
# with ORIGIN_URL=... if you bind a different host:port.
_PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [ -f "$_PROJECT_ROOT/cert.pem" ] && [ -f "$_PROJECT_ROOT/key.pem" ]; then
  _DEFAULT_ORIGIN="https://127.0.0.1:${PORT}"
else
  _DEFAULT_ORIGIN="http://127.0.0.1:${PORT}"
fi
ORIGIN_URL="${ORIGIN_URL:-$_DEFAULT_ORIGIN}"
SKIP_LIVEKIT="${SKIP_LIVEKIT:-0}"
SKIP_TUNNEL="${SKIP_TUNNEL:-0}"
FORCE_KILL="${FORCE_KILL:-0}"

cd "$(dirname "$0")/.."

red()   { printf "\033[0;31m%s\033[0m\n" "$*"; }
green() { printf "\033[0;32m%s\033[0m\n" "$*"; }
blue()  { printf "\033[0;34m%s\033[0m\n" "$*"; }
dim()   { printf "\033[2m%s\033[0m\n"     "$*"; }

step() { printf "\n\033[1;36m▸ %s\033[0m\n" "$*"; }

# ── Pre-flight ───────────────────────────────────────────────────
step "Pre-flight"
command -v docker >/dev/null || { red "docker CLI not installed."; exit 1; }
if [ "$SKIP_TUNNEL" != "1" ]; then
  command -v cloudflared >/dev/null || { red "cloudflared not installed. brew install cloudflared"; exit 1; }
  [ -f "$HOME/.cloudflared/cert.pem" ] || { red "Not logged in. Run: cloudflared tunnel login"; exit 1; }
fi

if docker compose version >/dev/null 2>&1; then
  DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DC="docker-compose"
else
  red "docker compose not available."; exit 1
fi

# ── Docker daemon ────────────────────────────────────────────────
step "Docker daemon"
if docker info >/dev/null 2>&1; then
  green "Docker already running."
else
  blue "Docker not running — starting a runtime…"
  started=0
  if command -v colima >/dev/null 2>&1; then
    blue "Starting colima (this can take ~30s the first time)…"
    if colima start; then started=1; fi
  elif [ -d "/Applications/OrbStack.app" ]; then
    open -a OrbStack && started=1
  elif [ -d "/Applications/Docker.app" ]; then
    open -a Docker && started=1
  fi
  [ "$started" = "1" ] || { red "No Docker runtime (Colima/OrbStack/Docker Desktop) found or failed to launch."; exit 1; }
  for i in $(seq 1 60); do
    if docker info >/dev/null 2>&1; then green "Docker is up."; started=ok; break; fi
    sleep 2
  done
  [ "${started:-}" = "ok" ] || { red "Docker didn't become ready within 120s."; exit 1; }
fi

# ── Dev services (db, livekit) ───────────────────────────────────
step "Dev services (Postgres${SKIP_LIVEKIT:+ only})"
services="db"
[ "$SKIP_LIVEKIT" = "1" ] || services="db livekit"

blue "Bringing up: $services"
# shellcheck disable=SC2086
$DC -f docker-compose.dev.yml up -d $services >/dev/null

blue "Waiting for Postgres to accept connections…"
for i in $(seq 1 30); do
  if $DC -f docker-compose.dev.yml exec -T db pg_isready -U obelisk >/dev/null 2>&1; then
    green "Postgres ready."
    break
  fi
  sleep 2
  if [ "$i" = "30" ]; then
    red "Postgres didn't become ready in time."
    $DC -f docker-compose.dev.yml logs --tail 30 db || true
    exit 1
  fi
done

# ── Prisma migrations ────────────────────────────────────────────
step "Prisma migrations"
# Use the dev DB URL the compose file defines. Override with DATABASE_URL
# in your shell/.env if your setup differs.
export DATABASE_URL="${DATABASE_URL:-postgresql://obelisk:obelisk@127.0.0.1:5432/obelisk}"

migrate_status=$(npx --no-install prisma migrate status 2>&1 || true)
if printf "%s" "$migrate_status" | grep -qE "Database schema is up to date|No migration found in prisma/migrations"; then
  green "Schema up to date."
elif printf "%s" "$migrate_status" | grep -qE "have not yet been applied|following migrations? have not been applied|drift detected|Database schema is not in sync"; then
  blue "Applying pending migrations…"
  if ! npx --no-install prisma migrate deploy; then
    red "prisma migrate deploy failed."
    exit 1
  fi
  green "Migrations applied."
else
  # Unknown state (e.g. shadow DB issues) — surface it but don't block.
  dim "prisma migrate status:"
  printf "%s\n" "$migrate_status" | sed 's/^/  /'
  blue "Attempting migrate deploy anyway…"
  npx --no-install prisma migrate deploy || red "migrate deploy reported issues — continuing."
fi

# ── Tunnel lookup ────────────────────────────────────────────────
TUNNEL_UUID=""
CRED_FILE=""
if [ "$SKIP_TUNNEL" != "1" ]; then
  step "Tunnel lookup"
  TUNNEL_UUID=$(cloudflared tunnel list 2>/dev/null | awk -v n="$TUNNEL_NAME" '$2==n {print $1}')
  if [ -z "$TUNNEL_UUID" ]; then
    red "Tunnel '$TUNNEL_NAME' not found."
    echo "Create it with:"
    echo "  cloudflared tunnel create $TUNNEL_NAME"
    echo "  cloudflared tunnel route dns --overwrite-dns $TUNNEL_NAME $TUNNEL_HOST"
    exit 1
  fi
  CRED_FILE="$HOME/.cloudflared/${TUNNEL_UUID}.json"
  [ -f "$CRED_FILE" ] || { red "Missing credentials file: $CRED_FILE"; exit 1; }
  dim "UUID: $TUNNEL_UUID"
fi

# ── Port check ───────────────────────────────────────────────────
step "Dev server on port $PORT"
DEV_ALREADY_RUNNING=0
pids=$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)

if [ -n "$pids" ]; then
  cmd=$(ps -p "$(echo "$pids" | head -1)" -o command= 2>/dev/null || true)
  case "$cmd" in
    *"tsx watch server.ts"*|*"server.ts"*|*"next"*)
      green "Dev server already listening — reusing (pid $(echo "$pids" | head -1))."
      DEV_ALREADY_RUNNING=1
      ;;
    *)
      blue "Port $PORT held by unrelated process(es): $pids"
      for pid in $pids; do ps -p "$pid" -o pid=,command= 2>/dev/null || true; done
      if [ -t 0 ] && [ "$FORCE_KILL" != "1" ]; then
        printf "Kill them and continue? [y/N] "; read -r ans
      else
        blue "Non-interactive or FORCE_KILL=1 — auto-killing."
        ans=y
      fi
      case "$ans" in
        y|Y|yes|YES)
          kill $pids 2>/dev/null || true; sleep 1
          still=$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)
          [ -n "$still" ] && { red "Force-killing: $still"; kill -9 $still 2>/dev/null || true; sleep 1; }
          still=$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)
          [ -n "$still" ] && { red "Port $PORT still in use. Aborting."; exit 1; }
          green "Port $PORT freed."
          ;;
        *)
          red "Aborting — free port $PORT and retry."; exit 1
          ;;
      esac
      ;;
  esac
fi

# ── Launch / reuse dev + tunnel ──────────────────────────────────
DEV_PID=""
TUNNEL_PID=""
TUNNEL_REUSED=0

cleanup() {
  echo
  blue "Shutting down…"
  if [ "$TUNNEL_REUSED" = "0" ] && [ -n "$TUNNEL_PID" ]; then
    kill "$TUNNEL_PID" 2>/dev/null || true
  fi
  if [ "$DEV_ALREADY_RUNNING" = "0" ] && [ -n "$DEV_PID" ]; then
    kill "$DEV_PID" 2>/dev/null || true
  fi
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

if [ "$DEV_ALREADY_RUNNING" = "0" ]; then
  blue "Starting npm run dev (logs → ./dev.log)…"
  npm run dev > dev.log 2>&1 &
  DEV_PID=$!
  for i in $(seq 1 60); do
    if lsof -iTCP:"$PORT" -sTCP:LISTEN -n -P >/dev/null 2>&1; then
      green "Dev server up."
      break
    fi
    if ! kill -0 "$DEV_PID" 2>/dev/null; then
      red "npm run dev died early. Last 20 log lines:"
      tail -20 dev.log
      exit 1
    fi
    sleep 1
  done
  if ! lsof -iTCP:"$PORT" -sTCP:LISTEN -n -P >/dev/null 2>&1; then
    red "Dev server didn't start within 60s. See dev.log"
    exit 1
  fi
fi

if [ "$SKIP_TUNNEL" = "1" ]; then
  step "Ready"
  green "Dev server: http://127.0.0.1:$PORT  (SKIP_TUNNEL=1)"
  if [ "$DEV_ALREADY_RUNNING" = "0" ]; then
    blue "Tailing dev.log — Ctrl-C to stop."
    while kill -0 "$DEV_PID" 2>/dev/null; do sleep 5; done
  fi
  exit 0
fi

step "Cloudflare tunnel"
# Detect any running cloudflared for this tunnel (by UUID or by name).
if pgrep -f "cloudflared .* ${TUNNEL_UUID}" >/dev/null 2>&1 \
   || pgrep -f "cloudflared .* ${TUNNEL_NAME}\b" >/dev/null 2>&1; then
  green "Tunnel '$TUNNEL_NAME' already running — reusing (logs wherever it was started)."
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
  # Give it a moment to either connect or die noisily.
  sleep 2
  if ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
    red "cloudflared died on startup. Last 20 log lines:"
    tail -20 tunnel.log
    exit 1
  fi
fi

step "Ready"
green "Local:  http://127.0.0.1:$PORT"
green "Public: https://$TUNNEL_HOST"
dim   "Logs:   ./dev.log  ./tunnel.log"
echo

# Block until something relevant exits.
while :; do
  if [ "$TUNNEL_REUSED" = "0" ] && [ -n "$TUNNEL_PID" ] && ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
    red "Tunnel exited."; break
  fi
  if [ "$TUNNEL_REUSED" = "1" ] && ! pgrep -f "cloudflared .* $TUNNEL_UUID" >/dev/null 2>&1; then
    red "Tunnel exited."; break
  fi
  if [ "$DEV_ALREADY_RUNNING" = "0" ] && [ -n "$DEV_PID" ] && ! kill -0 "$DEV_PID" 2>/dev/null; then
    red "Dev server exited."; break
  fi
  sleep 2
done
