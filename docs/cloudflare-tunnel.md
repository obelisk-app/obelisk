# Cloudflare Tunnel — `obelisk.fabri.lat` → localhost

Expose your local dev server to the public internet via a named Cloudflare
tunnel. Useful for testing NIP-07 / NIP-46 from a phone, sharing WIP with
others, or hitting webhooks that need a real HTTPS URL.

## One-shot launcher

```bash
npm run dev:tunnel
# or
./scripts/dev-tunnel.sh
```

The script:

1. Checks `cloudflared` is installed and you've logged in.
2. Looks up the tunnel UUID by name (`obelisk` by default).
3. If port 3000 is busy, lists the offending PIDs and asks before killing them
   (force-kills with `-9` if a graceful kill fails).
4. Starts `npm run dev` (logs streamed to `./dev.log`).
5. Waits up to 60 s for the dev server to bind port 3000.
6. Starts the tunnel pointing at `https://127.0.0.1:3000` (with
   `--no-tls-verify` because `server.ts` uses a self-signed dev cert when
   `cert.pem` exists).
7. Ctrl-C cleans up both processes.

Public URL: <https://obelisk.fabri.lat>

### Env overrides

```bash
TUNNEL_NAME=obelisk \
TUNNEL_HOSTNAME=obelisk.fabri.lat \
PORT=3000 \
ORIGIN_URL=https://127.0.0.1:3000 \
./scripts/dev-tunnel.sh
```

## One-time setup

```bash
brew install cloudflared

# Browser-based login (writes ~/.cloudflared/cert.pem for your zone)
cloudflared tunnel login

# Create the named tunnel (writes credentials JSON in ~/.cloudflared/)
cloudflared tunnel create obelisk

# Point obelisk.fabri.lat at the tunnel (overwrite if a record already exists)
cloudflared tunnel route dns --overwrite-dns obelisk obelisk.fabri.lat
```

## Gotchas

- **`localhost` vs `127.0.0.1`**: `server.ts` binds IPv4; `localhost` resolves
  to `::1` first on macOS, so the tunnel must use `127.0.0.1`.
- **HTTPS origin**: `server.ts` switches to HTTPS in dev when `cert.pem` and
  `key.pem` exist. The tunnel uses `--no-tls-verify` to accept the self-signed
  cert.
- **`allowedDevOrigins`**: Next 16 blocks dev requests from unknown hosts.
  `obelisk.fabri.lat` is whitelisted in `next.config.ts`.
- **Socket.io CORS**: if you hit cross-origin errors on the websocket, set
  `CORS_ORIGIN=https://obelisk.fabri.lat` before `npm run dev:tunnel`.
- **Default config conflict**: if you have `~/.cloudflared/config.yml`
  pointing at another tunnel (e.g. n8n), the script bypasses it via
  `--config /dev/null`.
