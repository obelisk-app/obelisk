# Cloudflare Tunnel — local dev over a public hostname

Expose your local `next dev` server to the public internet via a named Cloudflare tunnel. Useful for testing NIP-07 / NIP-46 from a phone or sharing WIP with someone outside your LAN.

## One-shot launcher

```bash
npm run dev:raise
# subcommands
npm run dev:raise -- status   # what's running for this repo
npm run dev:raise -- stop     # tear it all down
```

`scripts/dev-raise.sh` is idempotent — re-running it reuses an existing `next dev` and an already-running tunnel for this project rather than spawning duplicates. It does:

1. Pre-flight `node` / `npm` / `cloudflared` and `~/.cloudflared/cert.pem`.
2. Looks up the named tunnel's UUID and credentials file.
3. Picks a port: reuses this repo's `next dev` if one is already on `$PORT`; otherwise probes `$PORT+1..$PORT+10` until it finds one free, or fails with a clear message.
4. Wipes `.next` (cheap insurance against a corrupt cache; `CLEAN_NEXT_CACHE=0` to skip).
5. Starts `next dev` on webpack (`USE_TURBOPACK=1` to opt in) — Turbopack on Next 16.2.2 panics with "Next.js package not found" and the browser ends up reload-looping.
6. Waits up to 60 s for the dev server to bind the port.
7. Starts `cloudflared` pointing at `http://127.0.0.1:$PORT` (plain HTTP — no self-signed cert, no `--no-tls-verify` needed).
8. Waits for at least one `Registered tunnel connection` line, then probes `https://$TUNNEL_HOSTNAME` and self-heals the DNS route if the hostname doesn't respond.
9. Tails both processes; Ctrl-C cleans up the tree.

Logs land in `./dev.log` and `./tunnel.log`.

### Defaults

| Variable             | Default                  |
|----------------------|--------------------------|
| `TUNNEL_NAME`        | `obelisk-dev`            |
| `TUNNEL_HOSTNAME`    | `dex-test.obelisk.ar`    |
| `PORT`               | `3000`                   |
| `PORT_FALLBACK_MAX`  | `10`                     |
| `ORIGIN_URL`         | `http://127.0.0.1:$PORT` |
| `SKIP_TUNNEL`        | `0` (set `1` for dev-only) |
| `FORCE_KILL`         | `0` (set `1` to evict whatever holds `$PORT`) |
| `USE_TURBOPACK`      | `0` (webpack default)    |
| `CLEAN_NEXT_CACHE`   | `1`                      |

`.env` is auto-sourced before any of these defaults apply, so you can pin overrides per checkout.

## One-time setup

```bash
brew install cloudflared
cloudflared tunnel login                                              # writes ~/.cloudflared/cert.pem
cloudflared tunnel create obelisk-dev                                 # writes the credentials JSON
cloudflared tunnel route dns --overwrite-dns obelisk-dev dex-test.obelisk.ar
```

`dev-raise.sh` will re-run the `route dns` step automatically if the public hostname doesn't respond after a tunnel start.

## Gotchas

- **`localhost` vs `127.0.0.1`.** macOS resolves `localhost` to `::1` first; Next dev binds IPv4 by default. The tunnel always points at `127.0.0.1`.
- **`allowedDevOrigins`.** Next 16 blocks dev requests from unknown hosts. `dex-test.obelisk.ar` is whitelisted in `next.config.ts` — add any new tunnel hostname there.
- **Default config conflict.** If you have `~/.cloudflared/config.yml` pointing at another tunnel (e.g. n8n), the script bypasses it via `--config /dev/null`.
- **Bundler panic loop.** If `dev.log` shows `FATAL` / `Turbopack error` / `panic log has been written`, the script logs a one-time warning. Fall back to webpack (`USE_TURBOPACK=0`) or wipe `.next` + `node_modules/.cache` and re-run.
- **`SKIP_TUNNEL=1`.** Useful when you only want a dev server on a non-default port without touching cloudflared.
