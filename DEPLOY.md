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

```bash
cd obelisk
git pull
docker compose --env-file .env.production up -d --build
```

Migrations run automatically on startup.

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
