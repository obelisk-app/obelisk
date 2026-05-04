# Obelisk SFU — production deploy guide

End-to-end procedure to bring up the SFU on a production host. Targets a deployment agent who has SSH access to the box, an Obelisk relay account, and the obelisk-dex git checkout.

> **Read this whole document before running anything.** Each step has a rationale and a verification check; skipping verifications hides failures until much later.

> **Time budget:** ~30 minutes for a clean first deploy on a fresh VPS, ~5 minutes for re-deploys.

## 0. What you're deploying

A standalone Node service (`services/sfu/`) that:

- Speaks Nostr (kind 31313 advertise + 25052 control + 31314 active-call + 20078 + 25050 — see [`docs/sfu-system.md`](../../docs/sfu-system.md)).
- Runs WebRTC server-side via [werift](https://github.com/shinyoshiaki/werift-webrtc), forwarding audio/video between participants (Selective Forwarding Unit).
- Exposes a tiny HTTP server (`/`, `/healthz`, `/rooms`) for monitoring; this is what the Cloudflare tunnel exposes publicly.
- **Does NOT carry media through the tunnel.** Media flows directly UDP browser↔SFU. The tunnel is cosmetic + monitoring.

The service is **separate** from `obelisk-dex` (the web app). They communicate only over Nostr relays. Run them independently.

## 1. Prerequisites

Before you SSH into the production box:

| Required | Why |
|---|---|
| **A box with a public IP** (or 1:1 NAT with the public IP known) | WebRTC media uses UDP direct to the SFU. Cloudflare tunnels do NOT carry media. |
| **Inbound UDP `40000-40099` open in the firewall** (range configurable) | RTP packets come in on these ports. Default is 100 ports (~10 simultaneous rooms). |
| **Outbound TCP/443 open** | For Nostr WebSocket relays + STUN. |
| **Node 20 or newer** | werift requires it. |
| **`cloudflared` installed and authenticated** (`cloudflared tunnel login`) | For the public HTTP endpoint. |
| **A domain on Cloudflare DNS** for the tunnel hostname (e.g. `sfu.obelisk.ar`) | Where `/healthz` and the kind-31313 `url` tag point. |
| **An Obelisk relay account on `wss://relay.obelisk.ar`** | For the trusted-author authorization (anyone whitelisted there can issue `start` events). The SFU itself does NOT need to be whitelisted on that relay — only the *users* who'll call the SFU. |

If any of these are missing, fix them before continuing.

## 2. Provision the SFU code

```bash
# On the production box:
cd /opt
git clone https://github.com/Fabricio333/obelisk-dex.git
cd obelisk-dex/services/sfu

# Or if obelisk-dex is already cloned:
cd /path/to/obelisk-dex
git pull
cd services/sfu
```

Run the first-time setup script:

```bash
./scripts/setup.sh
```

It does:
1. Verifies Node ≥ 20 + npm.
2. `npm install` (~1 minute first time).
3. Copies `.env.example` → `.env` if missing.
4. Generates a fresh `SFU_NSEC` and patches it into `.env`.
5. Writes a starter `allow.json`.

**Capture the printed pubkey + npub** — you'll surface them publicly on the kind-31313 advertisement, and operators may want to verify the SFU's identity. The nsec is in `.env`; treat it as a secret.

## 3. Configure `.env`

Open `services/sfu/.env` in an editor. The defaults are reasonable for the canonical Obelisk deployment; the lines below are the ones you must review.

```bash
# Identity (set by setup.sh — leave alone unless rotating)
SFU_NSEC=<64-char hex>

# Operator pubkey — anyone signing events with this key can end any
# call, drain the SFU, etc. Leave blank for "the SFU is its own
# operator" (solo deploy, fine). Set to your personal hex pubkey for
# multi-admin deploys.
SFU_OPERATOR_PUBKEY=

# General relays — read+write. The dex publishes voice traffic to
# whichever it's configured for; the canonical Obelisk default is
# wss://public.obelisk.ar. Include any relay your group uses.
SFU_RELAYS=wss://public.obelisk.ar

# Trusted-author relays — read-only, but events seen here bypass the
# local allow.json (the relay's write-whitelist authorizes the
# publisher). For the canonical Obelisk deployment use the
# permissioned relay where members are pre-whitelisted.
SFU_TRUSTED_AUTHOR_RELAYS=wss://relay.obelisk.ar

# Public URL — the Cloudflare tunnel hostname. Cosmetic, but shows up
# in the kind-31313 advertisement so users see "hosted by …".
SFU_PUBLIC_URL=https://sfu.obelisk.ar

# Public IP override — REQUIRED on cloud VPS with 1:1 NAT (AWS, GCP)
# where the host can't see its own public IP. Get it via:
#   curl -s https://api.ipify.org
# Leave blank if the host has the public IP directly attached
# (Hetzner, DigitalOcean droplets without floating IP, etc).
SFU_PUBLIC_IP=

# UDP port range for RTP. These MUST be open inbound on the host
# firewall AND the cloud security group (if applicable).
SFU_RTP_PORT_MIN=40000
SFU_RTP_PORT_MAX=40099

# Capacity — start conservative; raise after stability is proven.
SFU_MAX_PARTICIPANTS_PER_ROOM=50
SFU_MAX_ROOMS=10
```

**About the trusted-relay model** (the line that matters most for production):

`SFU_TRUSTED_AUTHOR_RELAYS=wss://relay.obelisk.ar` makes the relay's existing write-whitelist *the* authorization for who can start a big-room call. Anyone whitelisted on `relay.obelisk.ar` can publish a kind 25052 there; the SFU sees that delivery and treats it as authorized. **No `allow.json` to maintain on the SFU side** — the obelisk admins manage it via the relay.

The local `allow.json` remains as an override (e.g. for testing without involving the relay). Keep it empty in production.

## 4. Firewall + UDP ports

These are the most common silent failures. Verify before launching:

```bash
# Open the RTP port range (Linux, ufw)
sudo ufw allow 40000:40099/udp comment 'obelisk-sfu RTP'

# Or iptables:
sudo iptables -A INPUT -p udp --dport 40000:40099 -j ACCEPT

# Cloud security groups: open the same range in the AWS / GCP / Hetzner
# console. The host firewall isn't enough on its own.

# Verify the port range is reachable from outside (run from a different host):
nc -u -v -z <public_ip> 40000
# Expect: succeeded (or "open"). "no route" means the firewall is
# blocking. UDP probing is unreliable — see step 9 for the real test.
```

If you can't open inbound UDP at all (e.g. dorm network, restrictive cloud), you need TURN. That's outside the scope of this guide; see [docs/sfu-system.md §10](../../docs/sfu-system.md#10-whats-not-in-v0-production-hardening-punch-list).

## 5. Cloudflare tunnel (one-time)

```bash
# If cloudflared isn't installed:
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared

# Authenticate. Opens a browser; pick the zone (obelisk.ar).
cloudflared tunnel login

# Create a named tunnel.
cloudflared tunnel create obelisk-sfu

# Route the public hostname to it. CHANGE 'sfu.obelisk.ar' to your
# actual hostname.
cloudflared tunnel route dns --overwrite-dns obelisk-sfu sfu.obelisk.ar
```

The tunnel UUID is now associated with the hostname. The `sfu-raise.sh` script picks it up automatically.

## 6. First launch (foreground, for the first run)

```bash
cd /opt/obelisk-dex/services/sfu
npm run raise
```

What `sfu-raise.sh` does, in order:

1. **Pre-flight**: Node version, `.env` validity, `cloudflared` cert, tunnel UUID lookup.
2. **Port pick**: reuses an existing SFU on `:4848` if it's ours; falls back to `:4849+` otherwise.
3. **Build**: runs `npm run build` if `dist/` is missing.
4. **Launch**: `node dist/index.js > sfu.log 2>&1`. Waits up to 30 s for `:4848` to bind.
5. **Tunnel**: starts `cloudflared` pointing at `http://127.0.0.1:4848`. Waits for at least one `Registered tunnel connection`.
6. **Public probe**: `curl https://sfu.obelisk.ar/healthz`. Self-heals the DNS route if missing.
7. **Tail**: stays attached. Ctrl-C tears down both the SFU and the tunnel cleanly.

Logs land in `services/sfu/sfu.log` and `services/sfu/tunnel.log`.

## 7. Verification (must do)

In a separate shell (or after Ctrl-C-ing the foreground run if you want to test offline):

```bash
# 1. Service is alive locally
curl http://127.0.0.1:4848/healthz
# Expect: {"status":"ok","uptime":<seconds>,"activeRooms":0}

# 2. Service is reachable through the tunnel
curl https://sfu.obelisk.ar/healthz
# Expect: same JSON. If it 5xxs, the tunnel isn't routing — see tunnel.log.

# 3. Service description matches the kind 31313 we publish
curl https://sfu.obelisk.ar/ | jq
# Expect: { "service": "obelisk-sfu", "pubkey": "<your hex>", "url": "https://sfu.obelisk.ar", ... }

# 4. The advertisement actually landed on the relay (use nak — `npm i -g nak`)
nak req -k 31313 -a <YOUR_SFU_HEX_PUBKEY> wss://public.obelisk.ar
# Expect: one event with kind 31313, your tags (url, relay, trusted_relay,
# codec, version, operator). If empty, the relay rejected the publish —
# check sfu.log for "all relays rejected".

# 5. Control listener is live (subscribe to kind 25052 + #p=<sfu>)
nak req -k 25052 -p <YOUR_SFU_HEX_PUBKEY> wss://relay.obelisk.ar
# Expect: empty (no calls yet) but no error.
```

If any of these fail, stop and fix before continuing. Logs are your friend:

```bash
tail -f services/sfu/sfu.log services/sfu/tunnel.log
```

## 8. Run as a service (daemonize)

`sfu-raise.sh` is foreground-only. For a real deploy use systemd or pm2.

### systemd (recommended)

Create `/etc/systemd/system/obelisk-sfu.service`:

```ini
[Unit]
Description=Obelisk SFU
After=network.target
Wants=network.target

[Service]
Type=simple
User=obelisk
WorkingDirectory=/opt/obelisk-dex/services/sfu
EnvironmentFile=/opt/obelisk-dex/services/sfu/.env
ExecStart=/usr/bin/node --enable-source-maps dist/index.js
Restart=on-failure
RestartSec=5
KillSignal=SIGTERM
TimeoutStopSec=15
StandardOutput=append:/var/log/obelisk-sfu/sfu.log
StandardError=append:/var/log/obelisk-sfu/sfu.log

[Install]
WantedBy=multi-user.target
```

Create `/etc/systemd/system/obelisk-sfu-tunnel.service`:

```ini
[Unit]
Description=Obelisk SFU Cloudflare tunnel
After=network.target
Wants=network.target

[Service]
Type=simple
User=obelisk
ExecStart=/usr/local/bin/cloudflared tunnel --no-autoupdate --url http://127.0.0.1:4848 run obelisk-sfu
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Enable + start:

```bash
sudo mkdir -p /var/log/obelisk-sfu
sudo chown obelisk:obelisk /var/log/obelisk-sfu
sudo systemctl daemon-reload
sudo systemctl enable --now obelisk-sfu obelisk-sfu-tunnel
sudo systemctl status obelisk-sfu obelisk-sfu-tunnel
```

Tail logs:

```bash
sudo journalctl -fu obelisk-sfu -fu obelisk-sfu-tunnel
# or
tail -f /var/log/obelisk-sfu/sfu.log
```

### pm2 (alternative)

```bash
cd /opt/obelisk-dex/services/sfu
npm run build
pm2 start dist/index.js --name obelisk-sfu --node-args='--enable-source-maps'
pm2 startup    # follow the printed instruction to enable on boot
pm2 save
```

The tunnel still needs its own process; use systemd for that or `pm2 start --name obelisk-sfu-tunnel "cloudflared tunnel --url http://127.0.0.1:4848 run obelisk-sfu"`.

## 9. Live end-to-end test

The first real test. You need:

- The SFU running (see step 8).
- A Nostr identity that's whitelisted on `wss://relay.obelisk.ar` (any obelisk member).
- A web browser to join the channel.
- Optionally `nak` (`npm i -g nak`) to publish manually until the dex has the "Start big-room call" UI button.

Steps:

1. **In the dex** (web UI), create a channel of type **📡 Big-room voice**, or convert an existing voice channel via channel settings → Channel type → Big-room voice → Save.
2. **Note the channel id** — it's in the URL: `/app?c=<channelId>` or `/voice/<channelId>`.
3. **Publish a kind 25052 `start`** to `wss://relay.obelisk.ar` (the trusted-author relay) using your whitelisted nsec:

   ```bash
   nak event \
     --kind 25052 \
     --tag p=<SFU_HEX_PUBKEY> \
     --tag e=<CHANNEL_ID> \
     --tag t=obelisk-sfu-control \
     --tag expiration=$(($(date +%s)+60)) \
     --content '{"action":"start","params":{"video":true,"screen":true,"maxParticipants":50}}' \
     --sec <YOUR_NSEC> \
     wss://relay.obelisk.ar
   ```

4. **In `sfu.log`** you should see (within ~1 s):
   ```
   [call-listener] control received action=start from=<your8> via=wss://relay.obelisk.ar trusted=true
   [room] room starting channelId=<chan8> host=<your8>
   [room] room active channelId=<chan8>
   [call-listener] start accepted
   ```
   Note `trusted=true` — that's the relay-whitelist authorization in action.
5. **Open the channel** in a browser. Within a few seconds, the dev console should log:
   ```
   [voice] topology mesh → sfu:<sfu-hex-prefix>
   [voice] new PC for <sfu-hex-prefix>
   [voice] connectionState connected …
   ```
6. **Speak.** Audio should flow within ~2-3 s of `connected`. `chrome://webrtc-internals` should show one PC, ICE candidates including the SFU's public IP.

If audio doesn't flow:
- Check `chrome://webrtc-internals` → outbound stats: are bytes leaving the browser?
- Check `sfu.log` for "inbound track" lines.
- Most common: ICE never reaches `connected` → UDP port range is blocked. See step 4.

## 10. Day-2 operations

### Stop / restart

```bash
sudo systemctl restart obelisk-sfu              # graceful (publishes status=closed for active rooms first)
sudo systemctl stop obelisk-sfu                 # same as restart but stays down
sudo systemctl stop obelisk-sfu-tunnel          # stop tunnel (SFU keeps running, just no public URL)
```

### Drain (graceful, reject new calls)

```bash
sudo systemctl kill -s SIGUSR1 obelisk-sfu
```

Existing rooms keep running until they end naturally; new `start` events are refused.

### Reload allow-list

If you're using `allow.json` (in addition to or instead of trusted-author relays):

```bash
# Edit /opt/obelisk-dex/services/sfu/allow.json
sudo systemctl kill -s SIGHUP obelisk-sfu
```

The advertisement re-publishes immediately with the updated allow-list.

### Rotate the SFU keypair

```bash
sudo systemctl stop obelisk-sfu
cd /opt/obelisk-dex/services/sfu
# Edit .env — clear SFU_NSEC=
node scripts/generate-keys.mjs --write
sudo systemctl start obelisk-sfu
```

The advertisement under the OLD pubkey stays on the relay until the next replacement — clients see two SFUs briefly. Document the new pubkey publicly.

### Upgrade to a new release

```bash
cd /opt/obelisk-dex
git pull
cd services/sfu
npm install                       # picks up dependency changes if any
npm run build
sudo systemctl restart obelisk-sfu
```

`SIGTERM` causes the SFU to publish kind 31314 `status=closed` for every active room before exiting, so clients see the call end cleanly rather than timing out.

### Monitoring

| Endpoint | Check |
|---|---|
| `GET /healthz` | 200 = up, 503 = draining or shutting down |
| `GET /rooms` | list of active rooms (channelId, status, participants count, host) |
| `GET /` | service description (mirrors kind 31313) |

For Prometheus / Datadog, scrape `/healthz` every 30 s. The activeRooms field gives you a basic gauge.

## 11. Troubleshooting

| Symptom | Likely cause |
|---|---|
| `SFU_NSEC must be a 64-char hex secret` on boot | `.env` SFU_NSEC line is blank or non-hex. Re-run `setup.sh`. |
| `publish: all relays rejected` for kind 31313 | The SFU's pubkey isn't whitelisted on a permissioned relay in `SFU_RELAYS`. Either whitelist it or remove that relay. |
| `start rejected: sender not authorized` despite the user being on relay.obelisk.ar | Check `via=` in the log. If it says a non-trusted relay, the user published only to public.obelisk.ar; ensure their client is configured to also write to the trusted relay. |
| Browser logs `topology mesh → sfu:xxx` but PC stays `new`/`failed` | UDP port range blocked. Open `40000-40099/udp` inbound. |
| `tunnel.log` shows `Registered tunnel connection` but `/healthz` 502s | The SFU process died after the tunnel came up. Check `sfu.log` for crash. |
| Browsers see each other in the participant list but no audio | werift offer/answer succeeded but RTP can't traverse. `SFU_PUBLIC_IP` likely unset on a 1:1-NAT host. |
| Calls work but audio is choppy | CPU saturated. werift transcodes per receiver; with N=20+ start watching `top` and consider mediasoup migration (post-v0). |
| `requestReset → closing for redial` repeats | Browser keeps hitting its 8 s polite watchdog because the SFU's offer never arrives. Check for relay filtering or SDP rejection in the browser console. |

When in doubt: set `SFU_LOG_LEVEL=debug`, restart, and grep `sfu.log` for the channel's 8-char prefix. Every event involving that room is tagged with it.

## 12. Security notes — read before public deploy

- **The SFU is a WebRTC endpoint for every peer in its rooms.** It can decrypt, record, or leak any media. Run it under your own operational control. Do NOT use someone else's SFU you don't trust.
- **Trusted-author relays delegate authorization to the relay operator.** If `relay.obelisk.ar` whitelists a hostile pubkey, that pubkey can spin up calls on your SFU. Keep your trust transitive — only list relays you operate or fully trust.
- **`allow.json` is committed to the repo's gitignore** but `setup.sh` writes a placeholder. Put real allow-list contents only in your deploy-host copy; never commit pubkeys you intend to keep curated.
- **The SFU's `nsec` lives in `.env`.** Permissions on the file should be `600`, owned by the service user.
- **Public STUN only** in v0. If you have users behind symmetric NAT, configure `SFU_TURN_*` with your own coturn or rent one (Twilio, Xirsys).

## 13. Rollback

If the deploy goes sideways:

```bash
sudo systemctl stop obelisk-sfu obelisk-sfu-tunnel
# Restore the previous version's checkout if you took a git tag, e.g.:
cd /opt/obelisk-dex
git checkout <previous-tag>
cd services/sfu
npm install
npm run build
sudo systemctl start obelisk-sfu obelisk-sfu-tunnel
```

The SFU is stateless across restarts (room state is reconstructed from kind 25052 / kind 39001/39002 on the relay), so a rollback or a kill loses only in-flight calls. Rooms whose kind 31314 was published with an `expiration` tag fall off the relay within 90 s of the SFU dying, so clients get a clean recovery either way.

## 14. Pointers

- [`docs/sfu-system.md`](../../docs/sfu-system.md) — design + event spec + auth model.
- [`README.md`](README.md) — operator runbook (day-1 commands, log greps, nak recipes).
- [`HANDOFF.md`](HANDOFF.md) — punch list of post-v0 work (mediasoup, encrypted signaling, tests, etc).
- [`docs/voice-system.md`](../../docs/voice-system.md) — the mesh client this integrates with.
- werift's source: [github.com/shinyoshiaki/werift-webrtc](https://github.com/shinyoshiaki/werift-webrtc).
