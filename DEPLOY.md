# Obelisk — Self-Hosted Deployment

Everything runs on a single server via Docker Compose: the app, PostgreSQL, and optionally a reverse proxy. Voice/video uses mediasoup WebRTC SFU.

## Requirements

- A VPS with 2GB+ RAM (Hetzner CX22 ~$4/mo, DigitalOcean $6/mo, Vultr $6/mo)
- A domain name
- Docker and Docker Compose installed on the server

## Architecture

### Option A: Cloudflare Tunnel (recommended)

```
Internet → Cloudflare → cloudflared tunnel → Obelisk (:3000) → PostgreSQL (:5432)
                                            → mediasoup (:40000-40100 UDP, WebRTC media)
```

No need to expose ports 80/443. The tunnel handles HTTPS. Only UDP ports 40000-40100 need to be open for voice/video.

### Option B: Direct with Caddy

```
Internet → Caddy (:443 HTTPS + auto SSL) → Obelisk (:3000) → PostgreSQL (:5432)
                                          → mediasoup (:40000-40100 UDP, WebRTC media)
```

Caddy handles HTTPS automatically via Let's Encrypt. Requires ports 80, 443, and 40000-40100/udp open.

## Setup

### 1. Install Docker on the VPS

```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com | sh
```

### 2. Clone and configure

```bash
git clone https://github.com/YOUR_USER/obelisk.git
cd obelisk
cp .env.production.example .env.production
```

Edit `.env.production`:
```bash
DOMAIN=obelisk.yourdomain.com
POSTGRES_PASSWORD=a-strong-random-password
PUBLIC_IP=YOUR_SERVER_IP          # Required for voice — your VPS public IPv4 address

# Optional but recommended: the global "instance owner" pubkey. The account
# you set here gets owner-level access on every server in this instance,
# can transfer Server.ownerPubkey, create new servers from /admin, and edit
# any user's cross-server memberships. See docs/multi-server-admin.md.
INSTANCE_OWNER_PUBKEY=your-64-char-hex-pubkey

# Required for the NWC wallet feature (NIP-47 zaps).
# Generate with: openssl rand -base64 32
NWC_ENCRYPTION_KEY=base64-encoded-32-byte-key
```

Open UDP ports for voice/video (WebRTC media):
```bash
sudo ufw allow 40000:40100/udp
```

### 3. Deploy

```bash
docker compose --env-file .env.production up -d --build
```

This will:
1. Build the Obelisk Docker image (Next.js + Socket.io + mediasoup)
2. Start PostgreSQL and wait for it to be healthy
3. Run Prisma migrations against the database
4. Start the app on port 3000
5. Start Caddy for reverse proxying (if using Option B)

> **Note — ARM64 (Hetzner CAX, Apple Silicon):** The Dockerfile includes fixes for building mediasoup on ARM64 with GCC 15 (`py3-pip` for the build toolchain and `CXXFLAGS="-include cstdint"` for C++ compatibility). This is handled automatically.

> **Build caching:** The Dockerfile uses BuildKit cache mounts for npm and separates dependency installation from Prisma schema copying. This means code-only changes rebuild in ~30s instead of re-running `npm ci` (~9min). Dependencies are only reinstalled when `package.json` or `package-lock.json` change.

### 4. Set up routing (choose one)

#### Option A: Cloudflare Tunnel

If you use a Cloudflare Tunnel (`cloudflared`), point the ingress rule to `localhost:3000`:

```yaml
# ~/.cloudflared/config.yml
ingress:
  - hostname: obelisk.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
```

Then restart the tunnel:
```bash
killall cloudflared && nohup cloudflared tunnel run YOUR_TUNNEL_NAME > /root/cloudflared.log 2>&1 &
```

The Caddy service in docker-compose is optional with this setup — you can remove it or leave it.

#### Option B: Direct with Caddy

Point a DNS A record to your server IP:
```
obelisk.yourdomain.com → YOUR_SERVER_IP
```

Caddy will auto-obtain SSL certs from Let's Encrypt. Make sure ports 80 and 443 are open.

> **If behind Cloudflare proxy (orange cloud):** Caddy can't do ACME challenges. Either use a Cloudflare Tunnel (Option A) or set the DNS record to DNS-only (gray cloud).

### 5. Seed the database (first time only)

```bash
docker compose --env-file .env.production exec app npx prisma db seed
```

### 6. Verify

Visit `https://obelisk.yourdomain.com` — you should see the app with full functionality including real-time messaging and voice channels.

## Updating

> **Always back up the database before pulling.** Migrations are designed to
> be additive but human error happens, and a 2-second `pg_dump` saves hours
> if anything goes sideways.

```bash
cd obelisk

# 1. Backup the DB to a timestamped file
docker compose --env-file .env.production exec -T db \
  pg_dump -U obelisk obelisk | gzip > "obelisk-backup-$(date +%Y%m%d-%H%M).sql.gz"

# 2. Pull the new code
git pull

# 3. Rebuild and roll only the app container (DB stays up — zero data downtime)
docker compose --env-file .env.production up -d --build app
```

Migrations run automatically on startup as part of `npm run build`
(`prisma generate && prisma migrate deploy && next build`). Only the `app`
container is recreated; PostgreSQL keeps running and serving the existing
volume.

### Restoring from a backup

```bash
gunzip < obelisk-backup-YYYYMMDD-HHMM.sql.gz | \
  docker compose --env-file .env.production exec -T db psql -U obelisk obelisk
```

### Rollback

The schema is forward-compatible — old code ignores new columns, so you can
roll back the app container without rolling back the database:

```bash
git checkout <previous-commit-sha>
docker compose --env-file .env.production up -d --build app
```

## Migration safety

Every migration in `prisma/migrations/` is reviewed to be **additive only**.
We never `DROP` columns/tables, never add `NOT NULL` without a default, and
never delete rows in a migration. That means:

- Existing messages, members, channels, reactions, etc. are never touched.
- Existing rows get safe defaults (e.g. `wotEnabled = false`) for any new
  columns added by a migration.
- A `prisma migrate deploy` against a populated production database is safe
  to run during a rolling deploy.

If a future PR ever needs a destructive migration, it will be flagged in
the PR description and ROADMAP entry — and the deploy steps will include an
explicit data-migration script run *before* `migrate deploy`.

## Behavioral changes between releases

These are runtime changes that don't lose data but do affect how users
interact with the app. Re-read this section after every `git pull` so you
know what shifted.

### User uploads moved out of `public/` + now persisted via Docker volume

Previously, pasted/uploaded images (via `POST /api/upload`) were written to
`public/uploads/` inside the container. This had two problems on deploy:

1. In a Next.js **production** build, `public/` is indexed at build time, so
   files written to `public/uploads/` at runtime were **never served** — every
   GET to `/uploads/<file>` returned 404. (Dev worked because Next.js re-reads
   `public/` on every request.)
2. Even if they had been served, there was no Docker volume mounted, so every
   `docker compose up -d --build` wiped all previously uploaded files.

**What changed:**

- The upload route now writes to `./uploads/` (a sibling of `public/`, not
  inside it).
- A new Route Handler at `src/app/uploads/[name]/route.ts` streams those
  files back at the same public URL (`/uploads/<name>`), so no client code,
  message content, or emoji URL changed.
- `docker-compose.yml` now mounts a named volume `uploads:/app/uploads` on
  the `app` service so files persist across restarts and rebuilds.

**What you (the operator) need to do on the next deploy:**

```bash
cd obelisk
# 1. Backup DB as usual
docker compose --env-file .env.production exec -T db \
  pg_dump -U obelisk obelisk | gzip > "obelisk-backup-$(date +%Y%m%d-%H%M).sql.gz"

# 2. Pull and rebuild — the named `uploads` volume is created automatically
git pull
docker compose --env-file .env.production up -d --build app
```

No manual volume creation is needed — `docker compose` creates the named
volume from the `volumes:` block on first run. You can verify it exists with:

```bash
docker volume ls | grep uploads
```

**Note on old uploads:** Any images pasted on previous deploys are gone —
they were ephemeral (stored on the overlay filesystem of a now-destroyed
container). There is nothing to migrate. From this deploy onward, uploads
persist.

**If you want to back up uploads** along with the database, add this to your
backup routine:

```bash
# Back up uploads volume as a tarball
docker run --rm -v obelisk_uploads:/data -v "$PWD":/backup alpine \
  tar -czf "/backup/uploads-backup-$(date +%Y%m%d-%H%M).tar.gz" -C /data .
```

(Replace `obelisk_uploads` with whatever `docker volume ls` reports — Compose
prefixes the volume name with the project directory.)

### Multi-server admin + WoT enforcement (post-`2428137`)

| Change | Impact |
|---|---|
| **Login no longer auto-joins a server.** `POST /api/auth/verify` only authenticates now; it doesn't create `Member` rows. | Existing members keep all their rows. New users after deploy land in chat with no servers and must hit `/invite/[code]` or `POST /api/servers/[id]/join` to get in. |
| **`POST /api/servers/[id]/join` now enforces WoT.** When `Server.wotEnabled = true`, the join endpoint requires the caller to be in `WotEntry` or `WotOverride`. | If WoT is off (default), nothing changes. If you've turned it on, make sure to **Refresh WoT** in `/admin → Access` so the cached follow list is populated before users try to join. |
| **`POST /api/channels` now requires `serverId` in the body.** | Web UI is updated. External scripts/curl calls must include `{ "serverId": "..." }`. |
| **All `/api/admin/*` routes now require `?serverId=`** (collection routes) or derive `serverId` from the resource (`[id]` routes). | Web UI is updated. External scripts/curl calls must add `?serverId=`. |
| **`/admin` is now a redirect** to `/admin/[serverId]`. | Bookmarks still work (the index page fetches `/api/admin/servers` and `router.replace`s to the first visible server). |
| **`INSTANCE_OWNER_PUBKEY` env var.** Without it, no one has cross-server super-admin powers — but per-server owners (anyone in `Server.ownerPubkey`) still work normally. | Set it in `.env.production` to unlock the new features: server picker, ownership transfer, cross-server membership editor, and "+ New Server" in the picker dropdown. |

See [docs/multi-server-admin.md](docs/multi-server-admin.md) for the full
multi-server model and role hierarchy.

## Useful commands

```bash
# View logs
docker compose --env-file .env.production logs -f app

# View all service logs
docker compose --env-file .env.production logs -f

# Restart
docker compose --env-file .env.production restart

# Stop everything
docker compose --env-file .env.production down

# Stop and delete database (destructive!)
docker compose --env-file .env.production down -v

# Run seed again
docker compose --env-file .env.production exec app npx prisma db seed

# Open a shell in the app container
docker compose --env-file .env.production exec app sh

# Connect to PostgreSQL directly
docker compose --env-file .env.production exec db psql -U obelisk
```

## What's included

| Feature | Status |
|---------|--------|
| Auth (NIP-07, nsec, NIP-46) | Works |
| Channels & categories | Works |
| Messages (send, edit, delete) | Works |
| **Real-time messages (Socket.io)** | **Works** |
| **Typing indicators** | **Works** |
| **Live reactions** | **Works** |
| **Voice channels (mediasoup WebRTC)** | **Works** |
| **Force disconnect on ban/kick** | **Works** |
| Admin panel | Works |
| Moderation | Works |
| Forum posts | Works |
| Auto SSL (HTTPS) | Works |

Everything works because the self-hosted setup runs the custom `server.ts` with persistent WebSocket connections and mediasoup for WebRTC voice/video.

## Troubleshooting

**502 Bad Gateway with Cloudflare Tunnel:** Check that `cloudflared` is running and the ingress rule points to `http://localhost:3000`. Check logs: `tail -20 /root/cloudflared.log`.

**Caddy can't get SSL cert:** Make sure your DNS A record points to the server IP directly (not through Cloudflare proxy) and ports 80/443 are open.

**App can't connect to DB:** Check `docker compose logs db` — the database may still be initializing on first run.

**Voice not working:** Ensure UDP ports 40000-40100 are open and `PUBLIC_IP` is set to your server's public IPv4 address in `.env.production`. Check mediasoup started: `docker compose logs app | grep mediasoup`.

**Build fails on ARM64 (mediasoup compilation):** The Dockerfile already includes the necessary fixes (`py3-pip`, `CXXFLAGS`). If it still fails, ensure the base image has `python3`, `make`, `g++`, and `linux-headers` installed.

**Out of memory:** The app needs ~512MB. Make sure your VPS has at least 2GB RAM (1GB for the app + 1GB for PostgreSQL + OS).

---

## Optional: LiveKit SFU (large voice rooms)

Voice channels default to **P2P mesh** — no extra infra, works up to ~8 participants. For community-sized rooms (50+ participants with cameras and screen share), you need a **LiveKit SFU**. It runs as a sibling container on the same host, already wired into `docker-compose.yml` behind a compose profile.

### Local dev (wired out-of-the-box)

`.env` and `docker-compose.dev.yml` already have dev-friendly defaults. Just run:

```bash
docker compose -f docker-compose.dev.yml up -d   # postgres + livekit
npm run dev
```

The admin panel's **Channels → New Channel → Voice** form will show the **"Large room (SFU)"** option immediately. No manual setup needed — dev credentials (`devkey` / `devsecret-...`) are baked into `docker-compose.dev.yml` and matched by the `LIVEKIT_*` entries in `.env`.

If you're iterating on SFU features, you only need to restart the app, not the containers.

### Production

### 1. Generate API credentials

```bash
# Any two random strings work; the secret must be ≥32 chars.
openssl rand -hex 16   # → LIVEKIT_API_KEY
openssl rand -hex 32   # → LIVEKIT_API_SECRET
```

### 2. Add to `.env.production`

```
LIVEKIT_URL=wss://yourdomain.com/livekit
LIVEKIT_API_KEY=...         # from step 1
LIVEKIT_API_SECRET=...      # from step 1
```

The same `LIVEKIT_URL` is exposed to the browser as `NEXT_PUBLIC_LIVEKIT_URL` automatically (see `docker-compose.yml`). That's how the admin UI knows to offer the "Large room (SFU)" channel option.

### 3. Open firewall ports

- `7881/tcp` — WebRTC TCP fallback (for users behind UDP-blocking networks).
- `50000-50100/udp` — WebRTC media.

Signaling (`7880/tcp`) is proxied via Caddy, so it doesn't need to be publicly exposed. On Ubuntu: `ufw allow 7881/tcp && ufw allow 50000:50100/udp`.

### 4. Add a Caddy reverse-proxy block

In your `Caddyfile`, inside the main site block for `${DOMAIN}`, add:

```
@livekit path /livekit /livekit/*
reverse_proxy @livekit livekit:7880
```

This terminates TLS at Caddy and forwards the WebSocket signaling to the LiveKit container. Reload Caddy after editing.

### 5. Start the LiveKit container

```bash
docker compose --profile livekit up -d
```

The `livekit` profile is opt-in — without `--profile livekit`, it won't start and the app falls back to mesh-only. Check logs:

```bash
docker compose logs livekit | tail
# expect: "starting LiveKit server ... version=..."
```

### 6. Rebuild the app container

`NEXT_PUBLIC_LIVEKIT_URL` is baked into the client bundle at build time, so the admin UI only surfaces the SFU option after a rebuild:

```bash
docker compose build app && docker compose up -d app
```

### 7. Create a large-room voice channel

In the admin panel → Channels → New Channel → Voice → Room size → "Large room (SFU)". Done. Smaller existing voice channels stay on mesh; no migration needed.

### Capacity planning

At 50 listeners + 5 cameras + 2 screens, LiveKit forwards roughly **~2.5 Gbps egress** sustained (simulcast + adaptive layers keep this down from the raw ~4.5 Gbps full-quality peak). CPU is never the bottleneck — bandwidth is.

- **Flat-rate hosts** (Hetzner, OVH, Netcup, Scaleway): effectively free, a €30–60/month VPS with 1 Gbps uplink handles several concurrent 50-person rooms.
- **Metered clouds** (AWS, GCP, Azure): 2.5 Gbps sustained ≈ 1.1 TB/hour ≈ $100/hour at AWS pricing. Watch the bill.

### Rolling back

Stop the container, unset the env vars, rebuild the app — the admin UI stops offering the SFU option and any channels already set to `sfu` simply fail to join until you flip them back to `mesh` in the admin panel. The data model isn't broken; `voiceMode` is just a string column with a default.

**Voice channels architecture reference:** see [docs/voice-system.md](docs/voice-system.md) for the two-mode model and per-mode feature details.
