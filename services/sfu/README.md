# Obelisk SFU — operator runbook

Standalone Node service that acts as an opt-in SFU (selective forwarding unit) for Obelisk voice channels. It speaks the same Nostr signaling wire as mesh calls (kinds 20078 + 25050), advertises itself on Nostr (kind 31313), and accepts call-control events (kind 25052) from a hand-picked allow-list of pubkeys.

**Read first:**
- [docs/sfu-system.md](../../docs/sfu-system.md) — full architecture and event spec.
- [DEPLOY.md](DEPLOY.md) — **production deploy procedure** (firewall, systemd, Cloudflare tunnel, verification, rollback). Use this if you're shipping the service to a real host.

This README is the day-to-day operator runbook: dev setup, log greps, nak recipes.

> **v0 / hackathon.** Audio forwarding works at small scale. Production hardening punch-list is in [docs/sfu-system.md §10](../../docs/sfu-system.md#10-whats-not-in-v0-production-hardening-punch-list).

---

## TL;DR

```bash
cd services/sfu
./scripts/setup.sh              # installs deps, generates a keypair, writes .env

# Edit .env  — at minimum set SFU_PUBLIC_URL and SFU_RELAYS
# Edit allow.json — add hex pubkeys authorized to start calls

# (one-time) Cloudflare tunnel for the management/identity endpoint
cloudflared tunnel login
cloudflared tunnel create obelisk-sfu
cloudflared tunnel route dns --overwrite-dns obelisk-sfu sfu.example.com

# Run
npm run raise                   # SFU + tunnel attached to your terminal
```

The SFU publishes its kind 31313 advertisement immediately and starts listening for kind 25052 control events from anyone in your allow-list.

---

## What you need

- **Node 20+** and **npm**.
- **A public IP** for the host (or 1:1 NAT with `SFU_PUBLIC_IP` set; or UDP port forwarding through a home router).
- **UDP `40000-40099` open inbound** (configurable). RTP media flows over these ports — straight from the SFU to clients, NOT through Cloudflare.
- **`cloudflared`** installed and authenticated (`brew install cloudflared && cloudflared tunnel login`). Optional if you set `SKIP_TUNNEL=1`, but you lose the public `/healthz` endpoint.
- **A Nostr relay** that both your group and the SFU subscribe to. The default is `wss://relay.obelisk.ar`; override with `SFU_RELAYS`.

## Layout

```
services/sfu/
├── package.json              own deps — werift, nostr-tools, dotenv
├── tsconfig.json
├── .env                      created by setup.sh (gitignored)
├── .env.example              the documented set of knobs
├── allow.json                gitignored; hot-reloaded on SIGHUP
├── src/                      service source
└── scripts/
    ├── setup.sh              first-run
    ├── generate-keys.mjs     SFU keypair generator
    └── sfu-raise.sh          start/stop/status (idempotent)
```

## Setup walk-through

### 1. Install + first-run

```bash
cd services/sfu
./scripts/setup.sh
```

The script:
- checks Node ≥ 20 (`werift` won't build on older)
- runs `npm install`
- copies `.env.example` → `.env` if missing
- runs `node scripts/generate-keys.mjs --write` if `SFU_NSEC` is blank
- writes a starter `allow.json` (empty `pubkeys: []`)

You'll see something like:

```
SFU keypair generated.
  pubkey hex : aabbccdd...
  npub       : npub1abcd...
  KEEP SECRET — anything below this line lets someone sign as your SFU:
  secret hex : 11223344...
  nsec       : nsec1...
```

That hex pubkey is what advertises on Nostr (kind 31313 author). Save the npub somewhere — users add it to authorize this SFU on their side.

### 2. Edit `.env`

Critical knobs:

| Var               | What                                                            |
|-------------------|-----------------------------------------------------------------|
| `SFU_NSEC`        | 64-char hex secret. `setup.sh` filled this in.                  |
| `SFU_OPERATOR_PUBKEY` | Optional. The pubkey that can do anything (end calls, drain). Leave blank for "the SFU is its own operator." |
| `SFU_RELAYS`      | Comma-separated wss:// URLs. Must include the relay your group uses for chat. |
| `SFU_PUBLIC_URL`  | The Cloudflare tunnel hostname, e.g. `https://sfu.example.com`. Cosmetic — used in advertisements. |
| `SFU_PUBLIC_IP`   | If on 1:1-NAT cloud (AWS, GCP), the public IP. Otherwise leave blank. |
| `SFU_RTP_PORT_MIN/MAX` | UDP port range for RTP (must be open on host firewall). |
| `SFU_MAX_PARTICIPANTS_PER_ROOM` | Hard cap. Default 50.                            |
| `SFU_MAX_ROOMS`   | Concurrent room cap. Default 10.                                |

Everything else has sensible defaults — see comments in `.env.example`.

### 3. Edit `allow.json`

```json
{
  "pubkeys": [
    "<hex-pubkey-of-user-1>",
    "<hex-pubkey-of-user-2>"
  ]
}
```

**Hex, not npub.** Convert with any Nostr tool, e.g. `nak decode <npub>`.

After editing while the service is running:

```bash
pkill -HUP -f obelisk-sfu     # or `pkill -HUP -f node.*dist/index`
```

The advertisement (kind 31313) is re-published immediately so the new pubkeys appear on the public allow-list.

### 4. Cloudflare tunnel (one-time)

```bash
brew install cloudflared
cloudflared tunnel login                                       # writes ~/.cloudflared/cert.pem
cloudflared tunnel create obelisk-sfu                          # writes <UUID>.json credentials
cloudflared tunnel route dns --overwrite-dns obelisk-sfu sfu.example.com
```

Replace `sfu.example.com` with your actual hostname. It needs to be a domain you control via Cloudflare DNS.

### 5. Run

```bash
npm run raise                  # foreground; Ctrl-C tears everything down
```

What `sfu-raise.sh` does:

1. Validates `.env` has a real `SFU_NSEC`.
2. Looks up the tunnel UUID + credentials.
3. Picks a port (reuses an already-running SFU; falls back if the port's busy).
4. Builds `dist/` (skips if up-to-date).
5. Starts `node --enable-source-maps dist/index.js > sfu.log`.
6. Waits for the HTTP port to bind.
7. Starts `cloudflared` pointing at `http://127.0.0.1:$PORT`.
8. Probes `https://$SFU_PUBLIC_URL/healthz`. Self-heals the DNS route if missing.
9. Tails both processes; Ctrl-C cleans up.

For watch-mode dev:

```bash
SFU_DEV=1 npm run raise        # uses tsx watch instead of compiled dist/
```

For service without tunnel (local-only):

```bash
SKIP_TUNNEL=1 npm run raise
```

### 6. Verify

```bash
curl https://sfu.example.com/                # service description
curl https://sfu.example.com/healthz         # { status: "ok", uptime, activeRooms }
curl https://sfu.example.com/rooms           # active rooms (empty initially)
```

And on the relay side:

```bash
nak req -k 31313 wss://relay.obelisk.ar      # should show your advertisement
```

The advertisement event's pubkey field == your `SFU_NSEC` derived pubkey.

## How a call gets started

The flow assumes the obelisk-dex client doesn't yet have the "start SFU call" button — that's [docs/sfu-system.md §5](../../docs/sfu-system.md#5-client-side-topology-selection) follow-up work. Until then, you publish the start event manually:

```bash
# Pick a NIP-29 voice channel id and your nsec.
CHANNEL_ID=<channel id hex>
SFU_PUBKEY=<hex pubkey of the SFU>
HOST_NSEC=<your nsec — must be in allow.json>

nak event \
  --kind 25052 \
  --tag p="$SFU_PUBKEY" \
  --tag e="$CHANNEL_ID" \
  --tag t="obelisk-sfu-control" \
  --tag expiration="$(($(date +%s) + 60))" \
  --content '{"action":"start","params":{"video":true,"screen":true,"maxParticipants":50}}' \
  --sec "$HOST_NSEC" \
  wss://relay.obelisk.ar
```

In `sfu.log` you should see:

```
INFO  [call-listener] control received  action=start from=<host8>
INFO  [room] room starting
INFO  [room] room active
INFO  [advertise] ...
```

Then check the relay for the kind 31314 active-call event:

```bash
nak req -k 31314 -d "$CHANNEL_ID" wss://relay.obelisk.ar
```

Once that's up, mesh-aware Obelisk clients in the channel will see the SFU's `["sfu","1"]` beacon. Connecting clients (after the planned client-side topology switch lands) dial only the SFU.

## Day-2 operations

### Status

```bash
./scripts/sfu-raise.sh status
```

Shows whether the SFU process and tunnel are up.

### Stop

```bash
./scripts/sfu-raise.sh stop
```

Or just Ctrl-C the foreground `npm run raise`. Either way, the SFU traps SIGTERM and:
- publishes `kind 31314 status=closed` for every active room
- sends `bye` (kind 25050) to every connected peer
- closes WebRTC PCs cleanly

### Reload allow-list

Edit `allow.json`, then:

```bash
pkill -HUP -f obelisk-sfu
```

The log will print `[config] allow-list reloaded added=… removed=… total=…` and the advertisement re-publishes immediately.

### Drain (graceful)

```bash
pkill -USR1 -f obelisk-sfu
```

Existing rooms keep running; new `start` events are refused. Useful before a planned restart.

### End a stuck call from the operator key

```bash
nak event \
  --kind 25052 \
  --tag p="$SFU_PUBKEY" \
  --tag e="$CHANNEL_ID" \
  --tag t="obelisk-sfu-control" \
  --content '{"action":"end"}' \
  --sec "$OPERATOR_NSEC" \
  wss://relay.obelisk.ar
```

Or `pkill -TERM -f obelisk-sfu` — it'll close all rooms cleanly.

### Kick a participant

```bash
nak event \
  --kind 25052 \
  --tag p="$SFU_PUBKEY" \
  --tag e="$CHANNEL_ID" \
  --tag t="obelisk-sfu-control" \
  --content '{"action":"kick","params":{"target":"<hex-pubkey>","reason":"spam"}}' \
  --sec "$HOST_NSEC" \
  wss://relay.obelisk.ar
```

The host of the call OR the operator can kick. The kicked pubkey is added to the room's deny list for the call's lifetime.

### Rotate SFU identity

The SFU's pubkey is on every advertisement. Rotating it = users on the old allow-list need to re-add the new pubkey.

```bash
pkill -TERM -f obelisk-sfu
# Edit .env — clear SFU_NSEC
node scripts/generate-keys.mjs --write
npm run raise
```

The replaceable advertisement under the OLD pubkey stays on the relay until the next replacement (or relay GC); no harm done — it just won't have an SFU process behind it.

## Logs + diagnostics

`sfu.log` and `tunnel.log` are written by `sfu-raise.sh`. The SFU log is JSON-ish line-prefixed by `LEVEL [tag]`. Useful greps:

```bash
tail -f sfu.log | grep '\[room\]'           # room lifecycle
tail -f sfu.log | grep '\[call-listener\]'  # control events
tail -f sfu.log | grep '\[peer\]'           # PC state per remote pubkey
tail -f sfu.log | grep WARN                 # things to investigate
```

`SFU_LOG_LEVEL=debug` cranks verbosity. Useful for tracking down why a peer isn't connecting.

## Sanity checks

| Symptom                                        | Likely cause                                                      |
|------------------------------------------------|-------------------------------------------------------------------|
| `SFU_NSEC missing or invalid` on boot          | `.env` has the line but it's blank or non-hex.                    |
| Advertisement never appears on the relay       | Wrong `SFU_RELAYS` URL, or the relay drops kind 31313 (NIP-78-adjacent — unlikely). |
| `start` event posted but no kind 31314         | Sender isn't in `allow.json` (check log for `start rejected`).    |
| Kind 31314 published but peers never connect   | `SFU_PUBLIC_IP` unset on a 1:1-NAT host → ICE candidates only have private IP. |
| Peers connect but no audio                     | `werift` package didn't install cleanly (rare on Node 20+); reinstall.  |
| `/healthz` 503                                 | Service is shutting down — wait or restart.                       |
| All peers fail with same NAT type              | Symmetric NAT both sides. Add a TURN: set `SFU_TURN_*`.           |

## What's wired vs what's pending

**Wired:**
- ✅ Nostr identity, advertisement publishing + refresh, allow-list config (file + env)
- ✅ Kind 25052 control listener with allow-list / operator / host gates
- ✅ NIP-29 admin/member tracking per active call
- ✅ Kind 31314 active-call publishing + heartbeat + closed marker
- ✅ Kind 20078 SFU presence beacon with `["sfu","1"]` topology marker
- ✅ Kind 25050 SDP/ICE per-peer transport mirroring mesh
- ✅ Perfect-negotiation glare resolution (polite by lex pubkey)
- ✅ HTTP `/`, `/healthz`, `/rooms` endpoints
- ✅ SIGHUP allow-list reload, SIGUSR1 drain, SIGTERM clean shutdown
- ✅ Cloudflare tunnel raise/stop/status script

**Pending — see [docs/sfu-system.md §10](../../docs/sfu-system.md#10-whats-not-in-v0-production-hardening-punch-list):**
- ⏳ Client-side topology switch (`dialOnly`, `originPubkey` plumbing in obelisk-dex)
- ⏳ Tests (`vitest` setup mirroring `src/lib/voice/`)
- ⏳ Mediasoup migration for native packet pass-through
- ⏳ Reconnect ladder (currently drops on `failed` and waits for redial)
- ⏳ Encrypted signaling (gift-wrap upgrade — paired with mesh upgrade)
- ⏳ Recording, simulcast, federation

## Trust model — read this once

The SFU is a WebRTC endpoint for every peer in its rooms. That means it can record, modify, or leak any media that flows through it. **Do not use someone else's SFU you don't trust.** The pure-mesh fallback exists exactly so you don't have to.

If you're running this for your own community, that's the safest deployment shape: SFU operator and group owner are the same person, allow-list is a single pubkey or a small known set.

If you're hosting an SFU for others, be explicit about what you do and don't log, and expect users to verify the SFU's pubkey out-of-band before relying on it for sensitive conversations.

## Pointers

- [docs/sfu-system.md](../../docs/sfu-system.md) — design + event spec
- [docs/voice-system.md](../../docs/voice-system.md) — mesh client this builds on
- [docs/webrtc-p2p-nostr-signaling.md](../../docs/webrtc-p2p-nostr-signaling.md) — exact signaling wire
- [docs/cloudflare-tunnel.md](../../docs/cloudflare-tunnel.md) — tunnel idiom mirrored here
