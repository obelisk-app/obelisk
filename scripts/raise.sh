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
#   PM2_APP           default: obelisk-dex  (if registered with PM2, raise will pm2-restart it
#                     instead of starting next directly — avoids fighting the supervisor)
#   PM2_TUNNEL        default: obelisk-dex-tunnel  (if registered, the cloudflared step is skipped)

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

# ── PM2 fast path ────────────────────────────────────────────────
# If obelisk-dex is supervised by PM2, restart that instead of fighting it
# for port $PORT. PM2 will respawn the old build otherwise.
PM2_APP="${PM2_APP:-obelisk-dex}"
PM2_TUNNEL="${PM2_TUNNEL:-obelisk-dex-tunnel}"
if command -v pm2 >/dev/null 2>&1 && pm2 id "$PM2_APP" 2>/dev/null | grep -q '[0-9]'; then
  step "PM2-managed app detected ($PM2_APP)"
  blue "pm2 restart $PM2_APP --update-env"
  pm2 restart "$PM2_APP" --update-env >/dev/null
  sleep 2
  if ! pm2 jlist 2>/dev/null | grep -q "\"name\":\"$PM2_APP\".*\"status\":\"online\""; then
    red "PM2 app failed to come online. Recent logs:"
    pm2 logs "$PM2_APP" --lines 20 --nostream 2>/dev/null || true
    exit 1
  fi
  green "App online via PM2."
  if pm2 id "$PM2_TUNNEL" 2>/dev/null | grep -q '[0-9]'; then
    dim "Tunnel ($PM2_TUNNEL) supervised by PM2 — leaving as-is."
    SKIP_TUNNEL=1
  fi
  step "Raised"
  green "Local:    http://127.0.0.1:$PORT"
  [ "$SKIP_TUNNEL" = "1" ] && green "Public:   https://$TUNNEL_HOST  (PM2 tunnel)"
  dim   "Logs:   pm2 logs $PM2_APP"
  exit 0
fi

# ── Port check ───────────────────────────────────────────────────
step "Production server on port $PORT"
pids=$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || ss -ltnp 2>/dev/null | awk -v p=":$PORT" '$4 ~ p { match($0,/pid=([0-9]+)/,a); if (a[1]) print a[1] }' | sort -u)
if [ -n "$pids" ]; then
  cmd=$(ps -p "$(echo "$pids" | head -1)" -o command= 2>/dev/null || true)
  blue "Port $PORT held by: $cmd"
  if [ "$FORCE_KILL" = "1" ]; then
    blue "FORCE_KILL=1 — killing."
    kill $pids 2>/dev/null || true; sleep 1
    still=$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || ss -ltnp 2>/dev/null | awk -v p=":$PORT" '$4 ~ p { match($0,/pid=([0-9]+)/,a); if (a[1]) print a[1] }' | sort -u)
    [ -n "$still" ] && { kill -9 $still 2>/dev/null || true; sleep 1; }
  else
    red "Port $PORT in use. Free it or set FORCE_KILL=1."; exit 1
  fi
fi

# ── Launch (detached — script exits while children keep running) ─
APP_PID=""
TUNNEL_PID=""
BOT_PID=""

blue "Starting next start on :$PORT (logs → ./app.log)…"
PORT="$PORT" nohup npx next start -p "$PORT" > app.log 2>&1 &
APP_PID=$!
disown "$APP_PID" 2>/dev/null || true
for i in $(seq 1 60); do
  lsof -iTCP:"$PORT" -sTCP:LISTEN -n -P >/dev/null 2>&1 && { green "App up."; break; }
  if ! kill -0 "$APP_PID" 2>/dev/null; then
    red "next start died. Last 20 log lines:"; tail -20 app.log; exit 1
  fi
  sleep 1
done
lsof -iTCP:"$PORT" -sTCP:LISTEN -n -P >/dev/null 2>&1 || { red "App didn't start within 60s. See app.log"; exit 1; }

# ── Price bot (optional) ─────────────────────────────────────────
if [ -n "${BOT_NSEC:-}" ]; then
  step "Price bot"
  blue "Starting price-bot (logs → ./bot.log)…"
  BOT_NSEC="$BOT_NSEC" \
  BOT_GROUP_ID="${BOT_GROUP_ID:-}" \
  BOT_INTERVAL_MS="${BOT_INTERVAL_MS:-}" \
  BOT_DISPLAY="${BOT_DISPLAY:-}" \
    nohup node scripts/price-bot.mjs > bot.log 2>&1 &
  BOT_PID=$!
  disown "$BOT_PID" 2>/dev/null || true
  sleep 1
  if ! kill -0 "$BOT_PID" 2>/dev/null; then
    red "price-bot died. Last 20 log lines:"; tail -20 bot.log
    BOT_PID=""
  else
    green "Bot up (PID $BOT_PID)."
  fi
else
  dim "BOT_NSEC not set — skipping price bot."
fi

if [ "$SKIP_TUNNEL" = "1" ]; then
  step "Ready"
  green "App: http://127.0.0.1:$PORT  (SKIP_TUNNEL=1)"
  dim "App PID $APP_PID — running in background. Stop: kill $APP_PID"
  exit 0
fi

step "Cloudflare tunnel"
if pgrep -f "cloudflared .* ${TUNNEL_UUID}" >/dev/null 2>&1 \
   || pgrep -f "cloudflared .* ${TUNNEL_NAME}\b" >/dev/null 2>&1; then
  green "Tunnel '$TUNNEL_NAME' already running — reusing."
  TUNNEL_REUSED=1
else
  blue "Starting cloudflared '$TUNNEL_NAME' → $ORIGIN_URL (logs → ./tunnel.log)"
  nohup cloudflared tunnel \
    --config /dev/null \
    --cred-file "$CRED_FILE" \
    run \
    --url "$ORIGIN_URL" \
    --no-tls-verify \
    "$TUNNEL_UUID" > tunnel.log 2>&1 &
  TUNNEL_PID=$!
  disown "$TUNNEL_PID" 2>/dev/null || true
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
dim   "PIDs:   app=$APP_PID${TUNNEL_PID:+  tunnel=$TUNNEL_PID}${BOT_PID:+  bot=$BOT_PID}"
dim   "Stop:   kill $APP_PID${TUNNEL_PID:+ $TUNNEL_PID}${BOT_PID:+ $BOT_PID}"
echo
exit 0
