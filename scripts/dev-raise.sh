#!/usr/bin/env bash
# Dev raise: `next dev` + Cloudflare tunnel.
#
# Idempotent: reuses an existing dev server / cloudflared if already running.
# Re-running is safe.
#
#   ./scripts/dev-raise.sh
#
# Env overrides:
#   TUNNEL_NAME        default: obelisk-dev
#   TUNNEL_HOSTNAME    default: dex-test.obelisk.ar
#   PORT               default: 3000
#   PORT_FALLBACK_MAX  default: 10
#   ORIGIN_URL         default: http://127.0.0.1:$PORT
#   SKIP_TUNNEL=1      only start dev server, no cloudflared
#   FORCE_KILL=1       kill anything on $PORT instead of falling back
#
# Subcommands:
#   ./scripts/dev-raise.sh           start (default)
#   ./scripts/dev-raise.sh status    show what's running for this project
#   ./scripts/dev-raise.sh stop      stop this project's dev server + tunnel

set -u

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"

if [ -f "$(dirname "$0")/../.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$(dirname "$0")/../.env"
  set +a
fi

TUNNEL_NAME="${TUNNEL_NAME:-obelisk-dev}"
TUNNEL_HOST="${TUNNEL_HOSTNAME:-dex-test.obelisk.ar}"
ORIGIN_CERT="${CLOUDFLARED_ORIGIN_CERT:-$HOME/.cloudflared/cert.pem}"
PORT="${PORT:-3000}"
PORT_FALLBACK_MAX="${PORT_FALLBACK_MAX:-10}"
ORIGIN_URL_OVERRIDE="${ORIGIN_URL:-}"
ORIGIN_URL="${ORIGIN_URL_OVERRIDE:-http://127.0.0.1:${PORT}}"
SKIP_TUNNEL="${SKIP_TUNNEL:-0}"
FORCE_KILL="${FORCE_KILL:-0}"
# Turbopack on Next 16.2.2 panics with "Next.js package not found" and the
# browser falls back to a full reload loop. Default to webpack until the
# Turbopack regression is fixed upstream. Flip with USE_TURBOPACK=1.
USE_TURBOPACK="${USE_TURBOPACK:-0}"
# Wipe .next before starting (cheap insurance against corrupted cache).
CLEAN_NEXT_CACHE="${CLEAN_NEXT_CACHE:-1}"

cd "$(dirname "$0")/.."

red()   { printf "\033[0;31m%s\033[0m\n" "$*"; }
green() { printf "\033[0;32m%s\033[0m\n" "$*"; }
blue()  { printf "\033[0;34m%s\033[0m\n" "$*"; }
dim()   { printf "\033[2m%s\033[0m\n"     "$*"; }
step()  { printf "\n\033[1;36m▸ %s\033[0m\n" "$*"; }

# Return the cwd of a pid (resolves symlinks). Empty on failure.
pid_cwd() {
  lsof -a -p "$1" -d cwd -Fn 2>/dev/null | awk '/^n/{print substr($0,2); exit}'
}

# Is this pid a `next dev` rooted in THIS repo?
is_our_next_dev() {
  local pid="$1" cmd cwd
  cmd=$(ps -p "$pid" -o command= 2>/dev/null || true)
  case "$cmd" in
    *"next dev"*|*"next-server"*|*"node "*"next"*) ;;
    *) return 1 ;;
  esac
  cwd=$(pid_cwd "$pid")
  [ -n "$cwd" ] && [ "$cwd" = "$REPO_ROOT" ]
}

# Subcommand dispatch ────────────────────────────────────────────
SUB="${1:-start}"
case "$SUB" in
  start) ;;
  status)
    pids=$(lsof -tiTCP -sTCP:LISTEN 2>/dev/null | sort -u || true)
    found_dev=""
    for pid in $pids; do
      if is_our_next_dev "$pid"; then
        port=$(lsof -p "$pid" -iTCP -sTCP:LISTEN -P -n 2>/dev/null | awk 'NR>1{split($9,a,":"); print a[length(a)]; exit}')
        green "next dev: pid $pid on :$port  (cwd $REPO_ROOT)"
        found_dev=1
        break
      fi
    done
    [ -z "$found_dev" ] && dim "next dev: not running for this repo"
    if pgrep -f "cloudflared .* tunnel" >/dev/null 2>&1; then
      pgrep -af "cloudflared .* tunnel" | while read -r line; do green "tunnel: $line"; done
    else
      dim "tunnel: no cloudflared running"
    fi
    exit 0
    ;;
  stop)
    blue "Stopping Obelisk dev + tunnel…"
    pids=$(lsof -tiTCP -sTCP:LISTEN 2>/dev/null | sort -u || true)
    for pid in $pids; do
      if is_our_next_dev "$pid"; then
        blue "killing next dev pid $pid"
        kill -TERM "$pid" 2>/dev/null
        pkill -TERM -P "$pid" 2>/dev/null
      fi
    done
    if pgrep -f "cloudflared .* tunnel" >/dev/null 2>&1; then
      blue "killing cloudflared"
      pkill -TERM -f "cloudflared .* tunnel" 2>/dev/null || true
    fi
    sleep 1
    green "Done."
    exit 0
    ;;
  -h|--help|help)
    sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'
    exit 0
    ;;
  *)
    red "Unknown subcommand: $SUB"
    echo "Usage: $0 [start|status|stop]"
    exit 2
    ;;
esac

# ── Pre-flight ───────────────────────────────────────────────────
step "Pre-flight"
command -v node >/dev/null || { red "node not installed."; exit 1; }
command -v npm  >/dev/null || { red "npm not installed."; exit 1; }
if [ "$SKIP_TUNNEL" != "1" ]; then
  command -v cloudflared >/dev/null || { red "cloudflared not installed. brew install cloudflared"; exit 1; }
  [ -f "$ORIGIN_CERT" ] || { red "Origin cert missing: $ORIGIN_CERT"; red "Run: cloudflared tunnel login (or set CLOUDFLARED_ORIGIN_CERT)"; exit 1; }
  dim "Origin cert: $ORIGIN_CERT"
fi
green "OK."

# ── Tunnel lookup ────────────────────────────────────────────────
TUNNEL_UUID=""
CRED_FILE=""
if [ "$SKIP_TUNNEL" != "1" ]; then
  step "Tunnel lookup"
  TUNNEL_UUID=$(cloudflared --origincert "$ORIGIN_CERT" tunnel list 2>/dev/null | awk -v n="$TUNNEL_NAME" '$2==n {print $1}')
  if [ -z "$TUNNEL_UUID" ]; then
    red "Tunnel '$TUNNEL_NAME' not found."
    echo "Create it with:"
    echo "  cloudflared tunnel create $TUNNEL_NAME"
    echo "  cloudflared tunnel route dns --overwrite-dns $TUNNEL_NAME $TUNNEL_HOST"
    exit 1
  fi
  CRED_FILE="$HOME/.cloudflared/${TUNNEL_UUID}.json"
  [ -f "$CRED_FILE" ] || { red "Missing credentials file: $CRED_FILE"; exit 1; }
  dim "UUID: $TUNNEL_UUID  →  $TUNNEL_HOST"
fi

# ── Port check ───────────────────────────────────────────────────
step "Dev server on port $PORT"
DEV_ALREADY_RUNNING=0

pids=$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)

if [ -n "$pids" ]; then
  pid1=$(echo "$pids" | head -1)
  cmd=$(ps -p "$pid1" -o command= 2>/dev/null || true)
  cwd=$(pid_cwd "$pid1")
  if is_our_next_dev "$pid1"; then
    green "Dev server already on $PORT — reusing this repo's next dev (pid $pid1)."
    DEV_ALREADY_RUNNING=1
  else
    blue "Port $PORT held by another process:"
    dim "  pid $pid1  cmd: $cmd"
    [ -n "$cwd" ] && dim "  cwd: $cwd"
    if [ "$FORCE_KILL" = "1" ]; then
      blue "FORCE_KILL=1 — killing."
      kill $pids 2>/dev/null || true; sleep 1
      still=$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)
      [ -n "$still" ] && { kill -9 $still 2>/dev/null || true; sleep 1; }
    else
      blue "Probing fallback ports $((PORT+1))..$((PORT+PORT_FALLBACK_MAX))"
      found=""
      for off in $(seq 1 "$PORT_FALLBACK_MAX"); do
        cand=$((PORT + off))
        cpids=$(lsof -tiTCP:"$cand" -sTCP:LISTEN 2>/dev/null || true)
        if [ -z "$cpids" ]; then
          found="$cand"; PORT="$cand"; green "Using free port $cand."; break
        fi
        cpid1=$(echo "$cpids" | head -1)
        if is_our_next_dev "$cpid1"; then
          PORT="$cand"; DEV_ALREADY_RUNNING=1; found="$cand"
          green "Our next dev already on $cand — reusing (pid $cpid1)."
          break
        fi
      done
      if [ -z "$found" ]; then
        red "No free port. Options:"
        red "  • FORCE_KILL=1 npm run dev:raise   (kill the foreign process on :$PORT)"
        red "  • PORT=3100 npm run dev:raise      (use a different port)"
        exit 1
      fi
    fi
  fi
fi

ORIGIN_URL="${ORIGIN_URL_OVERRIDE:-http://127.0.0.1:${PORT}}"
export PORT

# ── Launch ───────────────────────────────────────────────────────
DEV_PID=""
TUNNEL_PID=""
TUNNEL_REUSED=0

# No EXIT trap — we launch children detached with nohup+disown so the
# script can return and the dev server / tunnel keep running. Use the
# `stop` subcommand (above) to take them down.

if [ "$DEV_ALREADY_RUNNING" = "0" ]; then
  if [ "$CLEAN_NEXT_CACHE" = "1" ] && [ -d .next ]; then
    dim "Wiping .next cache (set CLEAN_NEXT_CACHE=0 to skip)…"
    rm -rf .next
  fi
  DEV_FLAGS="-p $PORT"
  if [ "$USE_TURBOPACK" != "1" ]; then
    DEV_FLAGS="$DEV_FLAGS --webpack"
    blue "Starting next dev on :$PORT (webpack — set USE_TURBOPACK=1 to opt in to Turbopack) (logs → ./dev.log)…"
  else
    blue "Starting next dev on :$PORT (turbopack) (logs → ./dev.log)…"
  fi
  # shellcheck disable=SC2086
  PORT="$PORT" nohup npx next dev $DEV_FLAGS > dev.log 2>&1 &
  DEV_PID=$!
  disown "$DEV_PID" 2>/dev/null || true
  for i in $(seq 1 60); do
    lsof -iTCP:"$PORT" -sTCP:LISTEN -n -P >/dev/null 2>&1 && { green "Dev server up."; break; }
    if ! kill -0 "$DEV_PID" 2>/dev/null; then
      red "next dev died. Last 20 log lines:"; tail -20 dev.log; exit 1
    fi
    sleep 1
  done
  lsof -iTCP:"$PORT" -sTCP:LISTEN -n -P >/dev/null 2>&1 || { red "Dev server didn't start within 60s. See dev.log"; exit 1; }
fi

if [ "$SKIP_TUNNEL" = "1" ]; then
  step "Ready"
  green "Dev: http://127.0.0.1:$PORT  (SKIP_TUNNEL=1)"
  [ -n "$DEV_PID" ] && dim "Dev PID $DEV_PID — running in background. Stop: ./scripts/dev-raise.sh stop"
  exit 0
fi

step "Cloudflare tunnel"
if pgrep -f "cloudflared .* ${TUNNEL_UUID}" >/dev/null 2>&1 \
   || pgrep -f "cloudflared .* ${TUNNEL_NAME}\b" >/dev/null 2>&1; then
  green "Tunnel '$TUNNEL_NAME' already running — reusing."
  TUNNEL_REUSED=1
else
  blue "Starting cloudflared '$TUNNEL_NAME' → $ORIGIN_URL (logs → ./tunnel.log)"
  nohup cloudflared --origincert "$ORIGIN_CERT" tunnel \
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

# Wait for cloudflared to register all 4 edge connections (means tunnel
# is actually carrying traffic, not just a process that's alive).
step "Tunnel handshake"
ready=0
for i in $(seq 1 30); do
  if grep -q "Registered tunnel connection" tunnel.log 2>/dev/null; then
    n=$(grep -c "Registered tunnel connection" tunnel.log 2>/dev/null || echo 0)
    [ "$n" -ge 1 ] && { green "cloudflared registered $n edge connection(s)."; ready=1; break; }
  fi
  if grep -qiE "error|failed|unauthorized|ingress" tunnel.log 2>/dev/null \
     && ! grep -q "Registered tunnel connection" tunnel.log 2>/dev/null; then
    red "cloudflared reported errors. Last 30 log lines:"; tail -30 tunnel.log
    exit 1
  fi
  sleep 1
done
if [ "$ready" != "1" ]; then
  red "cloudflared didn't register an edge connection within 30s."
  red "Last 30 log lines:"; tail -30 tunnel.log
  exit 1
fi

# Verify the public hostname actually serves our origin (catches the
# "tunnel up but DNS / ingress route points elsewhere" case).
step "Public reachability"

probe_public() {
  # Resolve via a public resolver to bypass local/ISP negative-cache
  # for newly-created CNAMEs. curl's -w always prints %{http_code}
  # (000 on failure); don't append a fallback or we get "000000".
  local ip
  ip=$(dig +short +time=2 +tries=1 "$TUNNEL_HOST" @1.1.1.1 | grep -m1 -E '^[0-9.]+$')
  if [ -n "$ip" ]; then
    curl -sk -o /dev/null -w "%{http_code}" --max-time 5 \
      --resolve "${TUNNEL_HOST}:443:${ip}" "https://$TUNNEL_HOST"
  else
    curl -sk -o /dev/null -w "%{http_code}" --max-time 5 "https://$TUNNEL_HOST"
  fi
}

wait_public() {
  local attempts="$1" code=""
  for _ in $(seq 1 "$attempts"); do
    code=$(probe_public)
    case "$code" in
      2*|3*|401|403) echo "$code"; return 0 ;;
      530|521|522|523|525) dim "edge $code (origin not reachable yet) — retrying…" ;;
      000) dim "no response — retrying…" ;;
      *)   dim "got $code — retrying…" ;;
    esac
    sleep 2
  done
  echo "$code"
  return 1
}

if code=$(wait_public 20); then
  green "https://$TUNNEL_HOST responding ($code)."
else
  blue "Public hostname not responding (last code: $code) — attempting DNS route fix…"
  if cloudflared --origincert "$ORIGIN_CERT" tunnel route dns --overwrite-dns "$TUNNEL_UUID" "$TUNNEL_HOST" >>tunnel.log 2>&1; then
    green "Re-routed $TUNNEL_HOST → $TUNNEL_NAME. Re-checking…"
    if code=$(wait_public 20); then
      green "https://$TUNNEL_HOST responding ($code)."
    else
      red "Still no response after DNS route (last code: $code)."
    fi
  else
    red "DNS route command failed — see tunnel.log."
  fi

  case "$code" in
    2*|3*|401|403) ;;
    *)
      red "https://$TUNNEL_HOST not serving content (last code: $code)."
      red "Likely causes:"
      red "  • Another cloudflared instance owns this hostname"
      red "    check: pgrep -af cloudflared"
      red "  • Origin scheme mismatch (try ORIGIN_URL=https://127.0.0.1:$PORT)"
      red "  • DNS propagation lag (wait a minute and re-run)"
      red "Tunnel log tail:"; tail -20 tunnel.log
      exit 1
      ;;
  esac
fi

step "Ready"
green "Local:  http://127.0.0.1:$PORT"
green "Public: https://$TUNNEL_HOST"
dim   "Logs:   ./dev.log  ./tunnel.log"
dim   "PIDs:   ${DEV_PID:+dev=$DEV_PID  }${TUNNEL_PID:+tunnel=$TUNNEL_PID}"
dim   "Stop:   ./scripts/dev-raise.sh stop"
echo
exit 0
