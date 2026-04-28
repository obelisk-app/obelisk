#!/usr/bin/env bash
# Raise Obelisk in production.
#
# Run this ON the production server, from inside the repo checkout, after
# you've git-pulled or just want to redeploy the current HEAD.
#
# What it does (halts on first ✗ so you can intervene manually):
#   1. Preflight: docker daemon, compose file, .env.production, disk, git state
#   2. Reports any running cloudflared tunnel (informational — never touches it)
#   3. Backs up DB + uploads volume → ./backups/
#   4. git pull (unless SKIP_PULL=1)
#   5. docker compose up -d --build app  (db stays up, zero-data-downtime)
#   6. Postflight: waits for app health, tails recent logs
#   7. Prints the exact restore command for the snapshot just taken
#
# Env overrides:
#   ENV_FILE=.env.production
#   COMPOSE_FILE=docker-compose.yml
#   DB_SERVICE=db                 name of the postgres service
#   APP_SERVICE=app               name of the app service
#   DB_NAME=obelisk               pg database name
#   DB_USER=obelisk               pg user
#   UPLOADS_VOLUME=obelisk_uploads  docker volume name (check: docker volume ls)
#   BACKUP_DIR=./backups
#   SKIP_PULL=1                   don't run git pull
#   SKIP_UPLOADS_BACKUP=1         skip the uploads tarball
#   HEALTH_URL=http://127.0.0.1:3000
#   BRANCH=master                 expected branch

set -u

ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
DB_SERVICE="${DB_SERVICE:-db}"
APP_SERVICE="${APP_SERVICE:-app}"
DB_NAME="${DB_NAME:-obelisk}"
DB_USER="${DB_USER:-obelisk}"
UPLOADS_VOLUME="${UPLOADS_VOLUME:-obelisk_uploads}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
SKIP_PULL="${SKIP_PULL:-0}"
SKIP_UPLOADS_BACKUP="${SKIP_UPLOADS_BACKUP:-0}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000}"
BRANCH="${BRANCH:-master}"

cd "$(dirname "$0")/.."

red()   { printf "\033[0;31m%s\033[0m\n" "$*"; }
green() { printf "\033[0;32m%s\033[0m\n" "$*"; }
blue()  { printf "\033[0;34m%s\033[0m\n" "$*"; }
dim()   { printf "\033[2m%s\033[0m\n"     "$*"; }
step()  { printf "\n\033[1;36m▸ %s\033[0m\n" "$*"; }
fail()  { red "✗ $*"; exit 1; }
ok()    { green "✓ $*"; }

STAMP="$(date +%Y%m%d-%H%M%S)"

# ── Preflight ────────────────────────────────────────────────────
step "Preflight"

command -v docker >/dev/null    || fail "docker not installed"
command -v git    >/dev/null    || fail "git not installed"
docker info >/dev/null 2>&1     || fail "docker daemon not running"
ok "docker running"

if docker compose version >/dev/null 2>&1; then
  DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DC="docker-compose"
else
  fail "docker compose not available"
fi
ok "docker compose: $DC"

[ -f "$COMPOSE_FILE" ] || fail "compose file missing: $COMPOSE_FILE"
[ -f "$ENV_FILE" ]     || fail "env file missing: $ENV_FILE (copy from .env.production.example)"
ok "compose + env file present"

for v in DOMAIN POSTGRES_PASSWORD; do
  grep -qE "^${v}=" "$ENV_FILE" || fail "$ENV_FILE missing required var: $v"
done
ok "required env vars present"

current_branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
[ "$current_branch" = "$BRANCH" ] || dim "⚠ on branch '$current_branch' (expected '$BRANCH') — continuing"

if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  dim "⚠ working tree is dirty — git pull may fail. Uncommitted files:"
  git status --short | sed 's/^/    /'
fi

# Disk space — need at least ~2GB for build + backup
avail_kb=$(df -Pk . | awk 'NR==2 {print $4}')
avail_mb=$(( avail_kb / 1024 ))
[ "$avail_mb" -ge 2048 ] || fail "only ${avail_mb}MB free — need ≥2048MB for safe build + backup"
ok "disk: ${avail_mb}MB free"

mkdir -p "$BACKUP_DIR"
ok "backup dir: $BACKUP_DIR"

# ── Cloudflared status (informational) ───────────────────────────
step "Cloudflare tunnel status"
if pgrep -af cloudflared >/dev/null 2>&1; then
  pgrep -af cloudflared | sed 's/^/  /'
  dim "(not touching it — restart manually if you need to)"
else
  dim "no cloudflared process detected"
fi

# ── DB backup ────────────────────────────────────────────────────
step "Backup: database"
DB_BACKUP="$BACKUP_DIR/obelisk-db-${STAMP}.sql.gz"
if $DC --env-file "$ENV_FILE" ps "$DB_SERVICE" 2>/dev/null | grep -qE '\b(Up|running)\b'; then
  if $DC --env-file "$ENV_FILE" exec -T "$DB_SERVICE" \
       pg_dump -U "$DB_USER" "$DB_NAME" 2>/dev/null | gzip > "$DB_BACKUP"; then
    size=$(du -h "$DB_BACKUP" | awk '{print $1}')
    ok "dumped → $DB_BACKUP ($size)"
  else
    rm -f "$DB_BACKUP"
    fail "pg_dump failed"
  fi
else
  fail "$DB_SERVICE container not running — can't back up"
fi

# ── Uploads backup ───────────────────────────────────────────────
step "Backup: uploads volume"
if [ "$SKIP_UPLOADS_BACKUP" = "1" ]; then
  dim "skipped (SKIP_UPLOADS_BACKUP=1)"
elif docker volume inspect "$UPLOADS_VOLUME" >/dev/null 2>&1; then
  UP_BACKUP="$BACKUP_DIR/obelisk-uploads-${STAMP}.tar.gz"
  if docker run --rm -v "${UPLOADS_VOLUME}:/data" -v "$PWD/${BACKUP_DIR}:/backup" alpine \
       tar -czf "/backup/$(basename "$UP_BACKUP")" -C /data . 2>/dev/null; then
    size=$(du -h "$UP_BACKUP" | awk '{print $1}')
    ok "tarred → $UP_BACKUP ($size)"
  else
    rm -f "$UP_BACKUP"
    fail "uploads tar failed"
  fi
else
  dim "⚠ volume '$UPLOADS_VOLUME' not found — skipping (check: docker volume ls)"
fi

# ── git pull ─────────────────────────────────────────────────────
step "git pull"
if [ "$SKIP_PULL" = "1" ]; then
  dim "skipped (SKIP_PULL=1)"
  dim "HEAD: $(git rev-parse --short HEAD) — $(git log -1 --pretty=%s)"
else
  before=$(git rev-parse HEAD)
  if ! git pull --ff-only; then
    fail "git pull failed — resolve manually, then re-run with SKIP_PULL=1"
  fi
  after=$(git rev-parse HEAD)
  if [ "$before" = "$after" ]; then
    dim "already up to date ($after)"
  else
    ok "pulled $(git rev-parse --short $before) → $(git rev-parse --short $after)"
    git log --oneline "$before..$after" | head -20 | sed 's/^/    /'
  fi
fi

# ── Build + roll app container ───────────────────────────────────
step "Rebuild + restart app"
blue "docker compose --env-file $ENV_FILE up -d --build $APP_SERVICE"
if ! $DC --env-file "$ENV_FILE" up -d --build "$APP_SERVICE"; then
  fail "build/restart failed — db is untouched, uploads safe, backups at $BACKUP_DIR"
fi
ok "$APP_SERVICE up"

# ── Postflight ───────────────────────────────────────────────────
step "Health check"
blue "waiting for $HEALTH_URL …"
ready=0
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 "$HEALTH_URL" || echo 000)
  case "$code" in
    2*|3*|401|403) ready=1; break ;;
  esac
  sleep 2
done
if [ "$ready" = "1" ]; then
  ok "app responding ($code)"
else
  red "✗ app not responding within 120s (last code: $code)"
  red "  last 40 log lines:"
  $DC --env-file "$ENV_FILE" logs --tail 40 "$APP_SERVICE" | sed 's/^/    /'
  red "  rollback: gunzip < $DB_BACKUP | $DC --env-file $ENV_FILE exec -T $DB_SERVICE psql -U $DB_USER $DB_NAME"
  exit 1
fi

# ── Done ─────────────────────────────────────────────────────────
step "Raised"
green "✓ $APP_SERVICE at $HEALTH_URL"
echo
dim "Backups this run:"
dim "  DB:      $DB_BACKUP"
[ -n "${UP_BACKUP:-}" ] && dim "  Uploads: $UP_BACKUP"
echo
dim "Restore DB:"
dim "  gunzip < $DB_BACKUP | $DC --env-file $ENV_FILE exec -T $DB_SERVICE psql -U $DB_USER $DB_NAME"
[ -n "${UP_BACKUP:-}" ] && {
  dim "Restore uploads:"
  dim "  docker run --rm -v ${UPLOADS_VOLUME}:/data -v \"\$PWD/${BACKUP_DIR}\":/backup alpine \\"
  dim "    tar -xzf /backup/$(basename "$UP_BACKUP") -C /data"
}
echo
dim "Tail logs: $DC --env-file $ENV_FILE logs -f $APP_SERVICE"
