# Obelisk — Self-Hosted Deployment

Everything runs on a single server via Docker Compose: the app, PostgreSQL, and a reverse proxy with auto SSL.

## Requirements

- A VPS with 2GB+ RAM (Hetzner CX22 ~$4/mo, DigitalOcean $6/mo, Vultr $6/mo)
- A domain name with DNS A record pointing to the server IP
- Docker and Docker Compose installed on the server

## Architecture

```
Internet → Caddy (:443 HTTPS + auto SSL) → Obelisk (:3000 Next.js + Socket.io) → PostgreSQL (:5432)
```

All three services run in Docker containers on a single machine. Caddy handles HTTPS automatically via Let's Encrypt.

## Setup (5 minutes)

### 1. Install Docker on the VPS

```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com | sh
```

### 2. Point your domain

Add a DNS A record:
```
obelisk.yourdomain.com → YOUR_SERVER_IP
```

Wait for DNS propagation (usually 1-5 minutes).

### 3. Clone and configure

```bash
git clone https://github.com/YOUR_USER/obelisk.git
cd obelisk
cp .env.production.example .env.production
```

Edit `.env.production`:
```bash
DOMAIN=obelisk.yourdomain.com
POSTGRES_PASSWORD=a-strong-random-password
```

### 4. Deploy

```bash
docker compose --env-file .env.production up -d --build
```

This will:
1. Build the Obelisk Docker image (Next.js + Socket.io)
2. Start PostgreSQL and wait for it to be healthy
3. Run Prisma migrations against the database
4. Start the app on port 3000
5. Start Caddy which auto-obtains SSL certs and proxies traffic

### 5. Seed the database (first time only)

```bash
docker compose --env-file .env.production exec app npx prisma db seed
```

### 6. Verify

Visit `https://obelisk.yourdomain.com` — you should see the app with full functionality including real-time messaging.


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
| **Voice channels** | **Works** |
| **Force disconnect on ban/kick** | **Works** |
| Admin panel | Works |
| Moderation | Works |
| Forum posts | Works |
| Auto SSL (HTTPS) | Works |

Everything works because the self-hosted setup runs the custom `server.ts` with persistent WebSocket connections.

## Troubleshooting

**Caddy can't get SSL cert:** Make sure your DNS A record points to the server IP and ports 80/443 are open.

**App can't connect to DB:** Check `docker compose logs db` — the database may still be initializing on first run.

**Out of memory:** The app needs ~512MB. Make sure your VPS has at least 2GB RAM (1GB for the app + 1GB for PostgreSQL + OS).
