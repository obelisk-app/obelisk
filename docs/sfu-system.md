# Obelisk SFU — opt-in selective forwarding for big rooms

This is the spec for **Obelisk's Bring-Your-Own-SFU**: a standalone service that any operator can run, advertise on Nostr, and offer to a hand-picked allow-list of users so they can host group calls beyond the mesh's 8-peer ceiling.

The SFU is **never required**. Mesh calls (`docs/voice-system.md`) keep working unchanged. When an authorized user opts into SFU mode, their client routes to the SFU instead of dialing every other peer — but the wire format the SFU speaks is **the same kind 20078 + 25050 signaling browsers already use**. The SFU is "just another peer that happens to have infinite uplink and forwards everyone's tracks to everyone else."

> **Status:** v0 / hackathon. Core Nostr signaling and room state are implemented. Media forwarding is implemented for audio at small scale; see §10 for the production hardening list.

---

## 1. Why a separate service?

Mesh dies around 6–10 peers because audio uplink scales as `O(N−1)` per peer and video much worse. Beyond that you need a node that receives everyone's tracks once and forwards them — an SFU.

We didn't want to put an SFU into the obelisk-dex repo for two reasons:

1. **Deploy coupling.** The web app is static; the SFU is a long-running stateful Node process with UDP/RTP and a public IP. They have different lifecycles, different scaling shapes, and very different failure modes.
2. **Trust scoping.** An SFU sees decrypted media for everyone in its rooms (it's the WebRTC endpoint for each peer). That's a privilege boundary. Running it as a separate process — under a separate Nostr identity, behind a separate Cloudflare tunnel, with its own allow-list — makes the boundary explicit.

The design follows Obelisk's "no central anything" ethos: an SFU is **operator-defined, opt-in, replaceable, and discoverable over Nostr**. Anyone can run one. Each SFU defines its own allow-list. A user who isn't on any SFU's allow-list can run their own. There is no global SFU registry.

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  obelisk-dex (Next.js, port 3000)                               │
│  Browser clients — mesh signaling over Nostr                    │
└────────────────────────┬────────────────────────────────────────┘
                         │ kind 20078 (presence)
                         │ kind 25050 (offer/answer/ICE)
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  Nostr relay — wss://relay.obelisk.ar                           │
│  (or any relay both parties subscribe to)                       │
└─┬───────────────────────────────────────────────────────────┬───┘
  │  kind 31313 (advertisement)                               │
  │  kind 31314 (active call state)                           │
  │  kind 25052 (call control: start/end/kick/update)         │
  │  kind 20078 / 25050 (same wire as mesh)                   │
  ▼                                                           ▼
┌─────────────────────────────┐         ┌─────────────────────────────┐
│  obelisk-sfu (Node, :4848)  │         │  ...other SFUs (independent)│
│  — Nostr identity (own pk)  │         │     each with own allow-list│
│  — allow-list (config file) │         └─────────────────────────────┘
│  — werift WebRTC stack      │
│  — mediasoup-style routing  │
└──────────┬──────────────────┘
           │ HTTP /healthz, /rooms via Cloudflare tunnel
           │ (https://sfu.obelisk.ar — cosmetic / health)
           │
           │ UDP/RTP direct between SFU public IP and clients
           │ (negotiated via ICE, NOT through the tunnel)
           ▼
       Public IP
```

Two separate channels are involved:

- **Nostr (signaling).** Identity, control plane, presence, SDP/ICE — all of it. Same relay carries chat, mesh voice signaling, and SFU events.
- **Direct UDP (media).** Once a client and the SFU finish ICE, RTP flows peer-to-SFU via UDP. The Cloudflare tunnel does **not** carry media — Cloudflare's L7 tunnels can't ferry SRTP. The tunnel only exposes a small HTTP service for health checks and identity verification.

That second point matters: **the SFU host needs a routable public IP for media.** The Cloudflare tunnel is cosmetic for the URL on the advertisement event; the actual media path is independent.

## 3. New event kinds

| Kind  | Type                      | Purpose                                                                | Author    |
|-------|---------------------------|------------------------------------------------------------------------|-----------|
| 31313 | parameterized replaceable | SFU advertisement — capabilities, allow-list, trusted-relay endpoints, public URL | SFU |
| 31314 | parameterized replaceable | Active-call state — which channel is in SFU mode, room rules, status   | SFU       |
| 25052 | ephemeral                 | Call control — start, end, kick, update rules                          | Authorized user → SFU |
| 20078 | ephemeral (reused)        | Presence beacon — SFU publishes one too, with `["sfu","1"]` marker     | Both      |
| 25050 | ephemeral (reused)        | SDP / ICE / track-info — exact same payload as mesh                    | Both      |

### 3.1 Kind 31313 — SFU advertisement

Published by the SFU's own keypair. Replaceable on the `d="obelisk-sfu"` coordinate. Refreshed on operator config change (allow-list edit, capacity bump) and once on boot.

```jsonc
{
  "kind": 31313,
  "pubkey": "<SFU_PUBKEY>",
  "tags": [
    ["d", "obelisk-sfu"],
    ["t", "obelisk-sfu-advertisement"],
    ["url", "https://sfu.example.com"],
    ["relay", "wss://relay.obelisk.ar"],
    ["cap", "50"],
    ["max_rooms", "10"],
    ["codec", "opus"],
    ["codec", "vp9"],
    ["codec", "h264"],
    ["allow", "<authorized_pubkey_hex_1>"],
    ["allow", "<authorized_pubkey_hex_2>"],
    ["operator", "<operator_pubkey_hex>"],
    ["region", "us-east"],
    ["version", "1"]
  ],
  "content": ""
}
```

**Tag semantics:**

- `url` — public HTTP endpoint for `/healthz` and `/`. Clients use this for the operator badge in the UI ("hosted by sfu.example.com").
- `relay` — relays this SFU subscribes to and publishes on for general traffic (advertisement, beacon, signaling). Multiple `relay` tags allowed.
- `trusted_relay` — relays whose write-whitelist authorizes the publisher of kind 25052 events. Clients should send their `start` events here; the relay's gating IS the SFU's allow-list. Multiple allowed.
- `cap` — max participants per single room.
- `max_rooms` — concurrent active rooms.
- `codec` — codecs the SFU forwards. Order is preference. Audio always includes `opus`; video typically `vp9` then `h264`.
- `allow` — hex pubkeys authorized to start calls on this SFU. Empty allow-list = SFU is unusable to anyone but the operator. **No magic open value** — if you want to allow anyone, run a different SFU mode (not in v0).
- `operator` — contact pubkey for the human running the box.

Discovery: clients filter `{ kinds: [31313], "#t": ["obelisk-sfu-advertisement"] }` on the relay to find SFUs they could potentially use, then check `allow` tags against their own pubkey to know which they can start calls on.

### 3.2 Kind 25052 — Call control (user → SFU)

Ephemeral, signed by the user, addressed to the SFU via `["p", SFU_PUBKEY]`. Carries an `action` in the JSON content.

```jsonc
{
  "kind": 25052,
  "pubkey": "<HOST_PUBKEY>",
  "tags": [
    ["p", "<SFU_PUBKEY>"],
    ["e", "<NIP_29_CHANNEL_ID>"],
    ["t", "obelisk-sfu-control"],
    ["expiration", "<now+60>"]
  ],
  "content": "{\"action\":\"start\",\"params\":{...}}"
}
```

**Actions:**

| Action  | Who can send | Params                                                          | Effect                                                                                       |
|---------|--------------|-----------------------------------------------------------------|----------------------------------------------------------------------------------------------|
| `start` | allow-listed | `{ video: bool, screen: bool, allow?: string[], deny?: string[], maxParticipants?: number, endsAt?: number }` | SFU joins the channel, starts publishing kind 31314, accepts member dials. |
| `end`   | host or operator | `{}`                                                       | SFU leaves the channel; kind 31314 flips to `status: closed`. Forwarding stops.              |
| `kick`  | host or operator | `{ target: pubkeyHex, reason?: string }`                   | SFU drops that peer's PC + adds to room's deny-list for the call's lifetime.                 |
| `update`| host or operator | partial `params` from `start`                              | Replaces room rules. Existing peers stay; new dials gated on the new ruleset.                |

**Validation pipeline (every kind 25052):**

1. Signature check (nostr-tools `verifyEvent`).
2. `expiration` not in the past (NIP-40).
3. `pubkey` is in the SFU's `allow` list (for `start`) OR is the host of an active room (for `end`/`kick`/`update`) OR is the operator (for any).
4. Channel `e` tag is reachable — SFU subscribes to its kind 39001/39002 to learn members/admins; if the list never arrives within 8 s, reject.
5. For `start`: capacity check (max_rooms not exceeded).

Any failure: silent drop. The SFU does not publish error events. The user finds out by their UI timing out waiting for kind 31314 to appear.

### 3.3 Kind 31314 — Active call state (SFU → world)

Published by the SFU when it accepts a call. Replaceable on `d="<channelId>"`. Refreshed every 60 s while the call is live; tagged with NIP-40 `expiration` set to `now+90` so it disappears within 90 s of an SFU crash. On clean call end, the SFU publishes one final replacement with `status=closed`.

```jsonc
{
  "kind": 31314,
  "pubkey": "<SFU_PUBKEY>",
  "tags": [
    ["d", "<CHANNEL_ID>"],
    ["t", "obelisk-sfu-active-call"],
    ["e", "<CHANNEL_ID>"],
    ["mode", "sfu"],
    ["host", "<HOST_PUBKEY>"],
    ["url", "https://sfu.example.com"],
    ["cap", "50"],
    ["status", "active"],
    ["expiration", "<now+90>"]
  ],
  "content": "{\"rules\":{\"video\":true,\"screen\":true,\"allow\":null,\"deny\":[]},\"startedAt\":1714750800,\"participants\":[\"pk1\",\"pk2\",\"pk3\"]}"
}
```

`participants` is informational (counters, UI badges) — the authoritative roster is still the kind 20078 beacons.

### 3.4 Reused mesh kinds — 20078 (presence) and 25050 (signaling)

The SFU publishes a **kind 20078 beacon** for the channel exactly like a regular peer would, with one extra tag:

```jsonc
{
  "kind": 20078,
  "pubkey": "<SFU_PUBKEY>",
  "tags": [
    ["e", "<CHANNEL_ID>"],
    ["t", "obelisk-voice-presence"],
    ["expiration", "<now+30>"],
    ["sfu", "1"],
    ["p", "<member_pubkey_1>"],   // members the SFU has live PCs to (transitive discovery)
    ["p", "<member_pubkey_2>"]
  ]
}
```

The `["sfu","1"]` tag is the **topology marker**. Clients reading the roster see this and know:
- Don't dial me to dial each other; everyone meshes through me.
- I'm the only RTCPeerConnection you need to open in this channel.

The SFU exchanges **kind 25050** offer/answer/ICE with each member exactly as the mesh code already does. This means **zero new wire format on the client** — the client's existing `Peer` and `VoiceClient` code already sends offers, listens for answers, and handles ICE for any pubkey in the roster. The client just needs a topology-selection rule (§5).

There's one small client-side extension: when the SFU forwards a track from member A to member B, the receiver (B) needs to know the track originated from A, not from the SFU. Today's `trackInfo` payload (`src/lib/voice/types.ts`) carries `{ trackId, kind }`. We extend it to `{ trackId, kind, originPubkey? }` — a backwards-compatible addition. The SFU sets `originPubkey` on every forwarded track; mesh clients keep omitting it. The receiver's tile-mapping uses `originPubkey ?? remotePubkey`.

## 4. Authorization model

There are two authorization paths a `start` event can take:

1. **Trusted-author relay path (production default):** the event was delivered to the SFU on a relay listed in `SFU_TRUSTED_AUTHOR_RELAYS`. That relay's own write-whitelist already gated who could publish; the SFU treats every event from that relay as authorized. This is how the canonical Obelisk deployment works — the operators of `wss://relay.obelisk.ar` curate who can host big-room calls, and the SFU just listens.
2. **Local allow-list path:** the event was delivered on an open relay (e.g. `wss://public.obelisk.ar`). The SFU falls back to checking `allow.json` (or `SFU_ALLOWED_PUBKEYS`) for the publisher's hex pubkey. Useful for solo deployments or testing.

Either path is sufficient. Combined with the four concentric trust boundaries below:

```
                        ┌──────────────────────────────────────┐
                        │  4. NIP-29 channel members           │
                        │     (kind 39002 list)                │
                        │   ┌──────────────────────────────┐   │
                        │   │  3. Per-call allow-list      │   │
                        │   │     (set in start params)    │   │
                        │   │   ┌──────────────────────┐   │   │
                        │   │   │  2. SFU allow-list   │   │   │
                        │   │   │     (kind 31313)     │   │   │
                        │   │   │   ┌──────────────┐   │   │   │
                        │   │   │   │ 1. Operator  │   │   │   │
                        │   │   │   │   pubkey     │   │   │   │
                        │   │   │   └──────────────┘   │   │   │
                        │   │   └──────────────────────┘   │   │
                        │   └──────────────────────────────┘   │
                        └──────────────────────────────────────┘
```

| Layer                     | Source of truth                          | Powers                                                                        |
|---------------------------|------------------------------------------|-------------------------------------------------------------------------------|
| 1. **Operator**           | `SFU_OPERATOR_PUBKEY` env (optional, defaults to SFU's own keypair) | Edit allow-list, end any call, kick anyone, drain SFU.                        |
| 2. **SFU allow-list**     | `allow.json` config file (or `SFU_ALLOWED_PUBKEYS` env CSV) | Send `start` to spin up calls. Reflected in kind 31313 advertisement.         |
| 3. **Per-call allow-list**| `start` event params (host's choice)     | Restrict who, among NIP-29 members, can dial in for THIS call. Defaults to "all members". |
| 4. **NIP-29 membership**  | Kind 39002 from the channel's relay      | Anyone outside this set is dropped at the SFU's signaling intake regardless of layers 1–3. |

**Dial-time check** (every incoming kind 25050 offer to the SFU's pubkey):

```ts
member?    = pubkey ∈ kind-39002-members(channelId)
allowed?   = !roomAllow || pubkey ∈ roomAllow
denied?    = pubkey ∈ roomDeny
admit      = member? && allowed? && !denied?
```

If `admit` is false, the SFU silently drops the offer. (No "rejected" event — same posture as the relay.)

**Operator key default.** If `SFU_OPERATOR_PUBKEY` is unset, the SFU's own keypair is the operator. That's fine for solo deployments; for multi-admin deployments, set it to the operator's npub explicitly so they can issue control events without sharing the SFU's nsec.

**Key rotation.** Replace `SFU_NSEC` in `.env`, restart. The advertisement is replaceable so it overwrites the previous one immediately on the relay; users on the prior allow-list will need to re-add the SFU's new pubkey to their UI. (The user-side allow-list is a follow-up — v0 just discovers SFUs by `#t` filter and surfaces all of them.)

## 5. Client-side topology selection

The Obelisk client decides between mesh and SFU per voice channel using two signals:

1. **Kind 31314 with `mode=sfu` and `status=active`** for the channel — definitive: SFU is up and accepting.
2. **A roster member with `["sfu","1"]`** in their kind 20078 beacon — fallback if 31314 hasn't propagated yet.

When either signal is present:

```ts
const sfuPubkey = roster.find(r => r.tags.includes(['sfu','1']))?.pubkey
                ?? activeCallEvent?.pubkey;

if (sfuPubkey) {
  // SFU mode — open exactly one PC, to the SFU
  voiceClient.dialOnly([sfuPubkey]);
} else {
  // mesh — dial everyone in the transitive roster (existing behavior)
  voiceClient.dialAll(transitiveParticipants(roster));
}
```

`dialOnly` is a small new API on `VoiceClient` that constrains the peer-creation loop to a specific pubkey set. Peers outside the set get torn down. In SFU mode this means the client has at most one outbound PC; in mesh mode it's identical to today.

**Track labelling on receive.** When the SFU forwards member A's mic to member B, B's `Peer.handleSignal` sees a `trackinfo` with `originPubkey: A`. The voice-room UI uses that to render the track in A's tile, not the SFU's. The SFU's own tile is hidden by default (it has no media of its own — purely a router).

This client work is **not in this PR** — the SFU service ships first; the client integration is a follow-up.

## 6. Call lifecycle

```
Time →

  Host                    SFU                       Member 1
  ────                    ───                       ────────
  publish 25052 start ──▶
                          verify (sig, allow,
                                  member, cap)
                          subscribe 39001/39002
                          create Room + werift
                          publish 31314 active ◀───────────────  see 31314, switch
                          publish 20078 beacon              to SFU mode, prepare offer
                              with sfu=1
                                                            publish 25050 offer ─▶
                          accept → werift PC,
                          add transceivers for
                          existing tracks
                          publish 25050 answer ─────────────▶ apply answer
                          publish 25050 ICE (batched) ─────▶ apply ICE
                                                            publish 25050 ICE ─▶
                          ICE complete → connected
                          ontrack(mic_A) ──┐
                                            │
                                            ▼ pipe to
                                            Member 2's PC sender
                          (renegotiate Member 2:
                           publish 25050 offer to M2)
                          ...
  publish 25052 end ─────▶
                          publish 31314 status=closed
                          close all PCs
                          stop beacon
                          drop room
```

**Steady state.** The SFU does three jobs concurrently:

1. **Refresh** — re-publish kind 31314 every 60 s, kind 20078 beacon every 15 s (both with NIP-40 `expiration` so a crash doesn't leave ghosts).
2. **Negotiate** — handle incoming kind 25050 events from members, drive the offer/answer/ICE state machine.
3. **Forward** — for each newly received track, add a transceiver on every other peer's PC and trigger renegotiation.

**End-of-call detection.** A call ends when:
- The host posts `25052 end`, OR
- The operator posts `25052 end`, OR
- The room has been empty for `EMPTY_GRACE_SECONDS` (default 300), OR
- The optional `endsAt` from the start params has passed.

In all cases: publish `31314 status=closed` once, drop the room, stop the beacon. The kind-31314 closed marker is itself replaceable, so the next start on the same channel overwrites it.

## 7. Files

```
services/sfu/
├── package.json              own deps (nostr-tools, werift, dotenv, fastify-light)
├── tsconfig.json
├── .env.example              all knobs, with defaults
├── .gitignore                .env, allow.json, node_modules, dist
├── README.md                 operator quickstart (this is the runbook)
└── src/
    ├── index.ts              entrypoint — wires everything, traps SIGTERM
    ├── config.ts             env loader, allow-list parser
    ├── log.ts                tagged console logger
    ├── identity.ts           load SFU_NSEC, derive pubkey
    ├── nip-kinds.ts          KIND_SFU_ADVERTISEMENT etc — single source of truth
    ├── relay.ts              nostr-tools SimplePool wrapper, sub/pub/sign
    ├── advertise.ts          publish/refresh kind 31313
    ├── auth.ts               allow-list + per-call ACL checks
    ├── membership.ts         track NIP-29 39001/39002 per channel
    ├── call-listener.ts      subscribe kind 25052, route to RoomManager
    ├── room-manager.ts       create/lookup/drop rooms, capacity guard
    ├── room.ts               one Room — peers, tracks, beacon, kind 31314
    ├── peer.ts               one werift RTCPeerConnection wrapper
    ├── signaling.ts          send/receive kind 25050, perfect-negotiation glue
    ├── http-server.ts        GET /, /healthz, /rooms — what the tunnel exposes
    └── types.ts              shared types

services/sfu/scripts/
├── setup.sh                  first-run: npm install, generate keys, write .env
├── generate-keys.mjs         emit nsec/npub via nostr-tools
└── sfu-raise.sh              start service + cloudflare tunnel (mirrors dev-raise)
```

The service has its own `package.json`, `node_modules`, and `dist/`. It does **not** import from `src/` of the Next app. That's deliberate: the SFU runs independently and the only contract between it and the web app is the Nostr event spec in §3.

## 8. Deploy

### 8.1 Where to run

Anywhere with:
- A public IP (or NAT with UDP port forwarding).
- A modern Node (≥ 20).
- 1 GB RAM minimum for an audio-only 50-peer room. Add ~1.5 GB per simultaneous video forwarder if you're transcoding.
- Inbound UDP open on the configured RTP port range (default `40000-40099`, 100 ports).
- Outbound TCP/443 to the relay, the Cloudflare edge, and STUN servers.

Pick a region close to the bulk of your users — the SFU adds one media hop, so distance matters more than for mesh.

### 8.2 Cloudflare tunnel (cosmetic — for the HTTP identity endpoint)

The SFU's `:4848` HTTP server isn't strictly required to be public — the call-control plane is on Nostr. But exposing it through a Cloudflare tunnel gives:

- A clean `https://sfu.example.com` to put in the kind 31313 `url` tag (looks legitimate to verifying clients).
- A `/healthz` endpoint for monitoring without opening a port on the host firewall.
- A `/rooms` endpoint for an operator dashboard.

```bash
brew install cloudflared
cloudflared tunnel login                              # writes ~/.cloudflared/cert.pem
cloudflared tunnel create obelisk-sfu                 # writes credentials
cloudflared tunnel route dns --overwrite-dns obelisk-sfu sfu.example.com
```

Then `services/sfu/scripts/sfu-raise.sh` brings up the service + the tunnel. It mirrors the `scripts/dev-raise.sh` UX from obelisk-dex (idempotent, status/stop subcommands, attached PIDs, log files).

**Critical:** The tunnel does NOT carry RTP. WebRTC media uses UDP straight from the SFU's public IP (advertised via STUN) to the client. Cloudflare L7 tunnels are HTTP/WebSocket-only — they cannot ferry SRTP. If your SFU is behind NAT with no UDP forward, you need TURN; the Cloudflare tunnel won't save you.

### 8.3 NAT and TURN

For most deployments:
- SFU on a VPS with a public IP → STUN-only is fine, no TURN.
- SFU on a home connection behind NAT → forward UDP `40000-40099` to the host, or run TURN.

`SFU_PUBLIC_IP` env tells werift what address to put in ICE candidates. If you're on a cloud VM with a 1:1 NAT (AWS, GCP) and the host doesn't see its public IP locally, you MUST set this.

### 8.4 Capacity sizing

| Workload                       | CPU            | RAM     | Bandwidth (down/up)         |
|--------------------------------|----------------|---------|------------------------------|
| 50 audio-only peers            | 1 vCPU, ~30%   | ~600 MB | 1.6 Mbps in / 78 Mbps out    |
| 50 audio + 1 screenshare       | 2 vCPU, ~50%   | ~900 MB | 4 Mbps in / 200 Mbps out     |
| 30 audio + 4 video             | 4 vCPU, ~70%   | ~1.5 GB | 12 Mbps in / 400 Mbps out    |

Numbers are approximate, transcoding-included (werift v0). With native pass-through (mediasoup migration, §10) CPU drops by ~5×.

## 9. Operator runbook

### Add a user to the allow-list

Edit `services/sfu/allow.json`:

```json
{ "pubkeys": ["aabbcc...hex", "ddeeff...hex"] }
```

Send `SIGHUP` to the running process (or just restart):

```bash
pkill -HUP -f obelisk-sfu
```

The advertisement is re-published immediately. Users on the new list can `start` a call within seconds.

### Start a call from the user side (manual test)

Until the obelisk-dex client has the "start SFU call" button, you can publish a `start` event with `nak`:

```bash
nak event \
  --kind 25052 \
  --tag p="<SFU_PUBKEY>" \
  --tag e="<CHANNEL_ID>" \
  --tag t="obelisk-sfu-control" \
  --tag expiration="$(($(date +%s) + 60))" \
  --content '{"action":"start","params":{"video":true,"screen":true,"maxParticipants":50}}' \
  --sec "<YOUR_NSEC>" \
  wss://relay.obelisk.ar
```

Watch the SFU's logs for `[call-listener] start accepted from <hostpk>`. Then check the relay for the resulting kind 31314.

### End a stuck call

```bash
nak event \
  --kind 25052 \
  --tag p="<SFU_PUBKEY>" \
  --tag e="<CHANNEL_ID>" \
  --tag t="obelisk-sfu-control" \
  --content '{"action":"end"}' \
  --sec "<OPERATOR_NSEC>" \
  wss://relay.obelisk.ar
```

Or just `pkill -TERM -f obelisk-sfu` — the process traps SIGTERM and publishes `31314 status=closed` for every active room before exiting.

### Drain (graceful)

`SIGUSR1` causes the SFU to stop accepting `start` events but keep existing rooms running until they end naturally. Useful for maintenance.

## 10. What's not in v0 (production hardening punch-list)

These are deliberate cuts. Everything is well-defined enough to follow up on.

- **Mediasoup migration.** v0 uses werift, which transcodes when forwarding. Mediasoup forwards encoded RTP packets natively (5–10× CPU reduction, simulcast support). Migrating means writing a thin Nostr-to-mediasoup-protocol adapter on the SFU; the wire seen by browsers stays kind 25050 SDP/ICE. ETA: post-hackathon.
- **Encrypted signaling.** Kind 25050 + 25052 are plaintext-signed today. Same posture as mesh (`docs/voice-system.md` §9). Gift-wrap upgrade lands when both client and SFU have NIP-44.
- **SVC + simulcast.** v0 forwards a single video layer. Real SFUs adapt per receiver — send 720p to focus, 180p to gallery thumbnails. Requires mediasoup or Insertable Streams.
- **Recording.** Out of scope. If you want it, add it as a separate "ghost peer" that subscribes to the SFU like any other client.
- **Federation.** SFUs don't talk to each other. A 100-person call across two SFUs is a separate design (cascading SFUs over an interconnect).
- **Per-user bandwidth budgets.** The SFU doesn't drop the noisiest peer when room bandwidth is saturated; everyone shares the pain. Add later via incoming-track REMB caps.
- **Tests.** `services/sfu/` ships without a test suite in v0. Per CLAUDE.md this is normally non-negotiable; the scope of "build a working SFU" was deemed the v0 milestone and tests are tracked as the very next task. Mesh code's test coverage (`src/lib/voice/`) is the template.
- **Client integration.** The obelisk-dex client doesn't yet know how to switch to SFU mode — `dialOnly` and `originPubkey` plumbing (§5) are follow-up. Until that ships, the SFU is exercised only via `nak` and direct WebRTC test pages.

## 11. Failure modes

| Case                                       | Behavior                                                                                    |
|--------------------------------------------|---------------------------------------------------------------------------------------------|
| SFU process crashes mid-call               | Kind 31314 expires within 90 s; clients fall back to mesh on the next roster sweep (or sit idle). |
| Relay drops mid-call                       | werift PCs survive (media is direct UDP). New joiners can't be discovered until relay is back. |
| Member's symmetric NAT, no TURN            | Their PC fails to ICE-connect to SFU; their tile stays empty. Same failure shape as mesh.   |
| 51st joiner past `cap`                     | SFU drops the offer. Client's `Peer` ICE-fails and surfaces "call full" (post-client-integration). |
| Allow-listed user starts call, then sneaks in non-member | Non-member's offer is dropped at the SFU (NIP-29 membership check, layer 4).         |
| Operator wants to silently spy             | Yes — the SFU is a WebRTC endpoint and can record/leak any media. **This is why the trust model puts SFU at the operator level.** Don't use someone else's SFU you don't trust. The pure-mesh fallback exists exactly for this. |
| Two SFUs both publish kind 31314 for the same channel | Replaceable on `(kind, pubkey, d-tag)` — both stay on the relay (different pubkeys). Client uses the first one it sees; future work picks by `created_at` or operator preference. |

## 12. References

- [docs/voice-system.md](voice-system.md) — mesh client architecture
- [docs/webrtc-p2p-nostr-signaling.md](webrtc-p2p-nostr-signaling.md) — wire format the SFU reuses
- [docs/cloudflare-tunnel.md](cloudflare-tunnel.md) — tunnel idiom mirrored by `sfu-raise.sh`
- [services/sfu/README.md](../services/sfu/README.md) — operator quickstart
- [werift](https://github.com/shinyoshiaki/werift-webrtc) — pure-JS WebRTC stack used in v0
- [mediasoup](https://mediasoup.org) — production target for v1
