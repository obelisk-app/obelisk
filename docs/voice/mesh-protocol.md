# Mesh — Wire Protocol

Two Nostr event kinds + one in-PC data channel:

| Kind | Direction | Purpose |
|---|---|---|
| **20078** (presence beacon) | broadcast (`#e` = channel id) | publisher-is-alive, with `p` connected tags and `peer` known-active gossip tags |
| **25050** (signal envelope) | directed (`#p` = recipient) | SDP offer/answer/ICE/trackinfo/qualityhint/bye/requestReset, JSON-encoded in `content` |
| **`obelisk-control` data channel** | per-peer-pair, ordered | hello, peerSnapshot, ping/pong, peerAdded/peerRemoved, bye |

## Presence beacon (kind 20078)

```jsonc
{
  "kind": 20078,
  "content": "",
  "tags": [
    ["e", "<channel-id>"],
    ["t", "obelisk-voice-presence"],
    ["expiration", "<unix-seconds, +45 from publish>"],
    ["p", "<connected-peer-pubkey>"], // 0..N — peers we have a live PC to
    ["peer", "<known-active-peer-pubkey>"], // 0..N — peers known from relay/control/local state
    ["v", "camera"], ["v", "screen"],  // 0..2 — outbound video tracks
    ["sfu", "1"],                       // present iff this client is an SFU node
    ["client", "obelisk-mesh-test-peer"], // diagnostic mesh test peer marker
    ["test-peer", "mesh"]                // legacy/simple diagnostic marker
  ]
}
```

Cadence:

- **Steady state**: every 10 s (`BEACON_INTERVAL_MS`).
- **Bring-up burst**: at join, additional publishes scheduled at
  `[300, 900, 1800, 3500, 7000, 12000, 18000]` ms
  (`BEACON_BRINGUP_DELAYS_MS`) so a peer who joined a few seconds
  before us discovers us within seconds, not one full steady-state tick.
- **Refresh on connect/disconnect/discovery change**: when our connected
  set or known-active peer set changes, schedule a debounced beacon
  (~250 ms) so the new information shows up in everyone's transitive
  roster within a single hop.

The receiver dedups by `(pubkey, created_at)` — newer beacons replace
older ones; expired beacons (`expiration` past, normally 45 s after
publish) are swept out by `subscribeRoster`'s
`(PRESENCE_TTL_SECONDS / 2) * 1000` interval. Older clients that only
understand `p` tags still get connected-peer transitive discovery; newer
clients use `peer` tags to learn about participants that a publisher has
seen but not directly connected to yet.

### Diagnostic mesh test peers

Synthetic mesh peers spawned from the SFU admin UI publish the same presence
beacon plus both diagnostic markers:

- `["client", "obelisk-mesh-test-peer"]`
- `["test-peer", "mesh"]`

These peers are not SFUs and still negotiate direct P2P mesh. The marker only
changes the browser-side admission gate: a local channel admin may dial and
accept signals from the marked pubkey without first adding it to the NIP-29
member list. Regular members still apply the normal member/admin/open-room gate,
so the marker cannot be used by arbitrary pubkeys to join private calls for
non-admin viewers. This is for operator diagnostics and synthetic media tests.

## Signal envelope (kind 25050)

```jsonc
{
  "kind": 25050,
  "content": "<JSON of VoiceSignalPayload>",
  "tags": [
    ["p", "<recipient-pubkey>"],
    ["e", "<channel-id>"],
    ["t", "obelisk-voice-signal"]
  ]
}
```

`content` is a `VoiceSignalPayload` (see `src/lib/voice/types.ts`).
Variants:

| `type` | Carries |
|---|---|
| `offer` | `sdp`, `sessionId`, `seq` |
| `answer` | `sdp`, `sessionId`, `seq` |
| `ice` | `candidates: RTCIceCandidateInit[]`, `sessionId`, `seq` |
| `trackinfo` | `trackInfo: { trackId, kind }`, `sessionId`, `seq` |
| `qualityhint` | `qualityHint: { maxBitrate, maxFramerate }`, `sessionId`, `seq` |
| `bye` | `sessionId`, `seq`, optional `byeReason: 'local-leave' \| 'room-full' \| string`. `'room-full'` is sent by every in-cap peer to a 6th arrival so the joiner learns immediately. |
| `requestReset` | `sessionId`, `seq` (polite-side asks impolite to hard-reset) |

`sessionId` lets the receiver detect remote PC restarts; `seq` lets
the receiver dedup retransmits within a session.

### Perfect negotiation

Polite/impolite is decided by lexicographic pubkey comparison
(`selfPubkey > remotePubkey` ⇒ polite). The polite peer rolls back its
offer on glare, applies the remote, then re-negotiates. Impolite never
rolls back — its offer always wins. SFU peers are forced
remote-impolite (we're polite for them) because werift can't roll back.

### Reconnect ladder

`peer.ts` runs three escalating recovery paths:

1. `requestReset` → polite asks impolite to perform a hard reset.
2. `restartIce` → impolite tries an ICE restart up to `ICE_RESTART_LIMIT` times.
3. `performHardReset` → close the PC, build a fresh one, re-attach
   tracks, kick a fresh negotiation.

Delays: `RECONNECT_DELAYS_MS = [750, 1500, 3000, 6000, 10000]` for
impolite; `POLITE_RESET_DELAYS_MS = [2500, 5000, 10000]` for polite.

## Control channel (`obelisk-control`)

A single ordered RTCDataChannel per peer pair, opened immediately
after PC construction. **Only the impolite side calls
`createDataChannel`**; the polite side adopts via `pc.ondatachannel`.
Symmetry matters — both sides creating would produce two channels per
pair, doubling heartbeat and hello traffic.

```ts
type ControlMessage =
  | { type: 'hello'; peers: string[]; sessionId: string; build: string }
  | { type: 'peerSnapshot'; peers: string[]; ts: number }
  | { type: 'peerAdded'; pubkey: string }
  | { type: 'peerRemoved'; pubkey: string }
  | { type: 'bye'; reason: string }
  | { type: 'ping'; ts: number }
  | { type: 'pong'; ts: number; echoTs: number };
```

Lifecycle (constants in `src/lib/voice/control-channel.ts`):

- **Open timeout**: 15 s. If `dc.readyState` doesn't reach `'open'`,
  fire `onDead('open-timeout')` so the owner tears the peer down
  rather than waiting forever for a dead PC.
- **Heartbeat**: ping every 2.5 s. Pong response carries `echoTs` →
  RTT measurement.
- **Peer snapshot**: every 5 s, send `peerSnapshot { peers }` with the
  sender's full known-active peer set.
- **Dead-peer timer**: 20 s without ANY inbound traffic (ping, pong,
  hello, peerSnapshot, peerAdded/Removed) → `onDead('heartbeat-lost')`.
- **Bye**: synchronous send via `dc.send` BEFORE `pc.close()` →
  remote receives within ~10 ms.

Discovery propagation:

- On open, send `hello { peers: meshKnownPubkeys(), sessionId, build }`.
- Every 5 s, and after relay/control discovery changes, send
  `peerSnapshot { peers: meshKnownPubkeys(), ts }` to every open control
  channel. This is the reliable path for sharing peers that are in the call
  but not directly established yet.
- Whenever a new peer connects, send `peerAdded { pubkey }` to every
  OTHER peer as a fast incremental hint.
- Whenever a peer disconnects, send `peerRemoved { pubkey }` to every
  OTHER peer as a fast incremental hint.

The receiver feeds these into the `DiscoveryEngine`
(`src/lib/voice/discovery.ts`), which tracks `(pubkey, viaPeer)` so a
single peer's `peerRemoved` doesn't drop someone other peers still
claim. Full `peerSnapshot` messages replace the claims from that one
neighbor so stale transitive hints age out without requiring relay beacons.

## Hangup paths (in priority order)

1. **Control-channel `bye`** — primary. Sent synchronously over the
   data channel before `pc.close()`. Other side receives within
   ~10 ms; `onPeerDead('bye:local-leave')` fires immediately.
2. **Control-channel heartbeat-lost** — backup. 20 s after the last
   inbound message, `onDead('heartbeat-lost')` fires. Covers tab
   crashes / network blackouts where bye was never sent.
3. **Relay `bye` (kind 25050 type=bye)** — backup. Used when the data
   channel hadn't opened yet.
4. **`pc.connectionState='failed' | 'closed'`** — last resort.
   ICE-failure detection takes ~30 s in Chromium; only happens when
   the first three paths all missed.

All four converge on the same `tearDownPeer(pubkey)` (idempotent — see
`client.ts`).

## Membership + WoT

- The voice channel's NIP-29 admin/member list is the trust gate.
  Marked mesh test peers are a narrow diagnostic exception for local channel
  admins only; they do not change the gate for regular members.
  Signals from non-members are deferred for up to
  `DEFERRED_SIGNAL_TTL_MS = 5_000` ms; if `updateRoles()` admits the
  sender within that window the queue replays through `routeSignal`.
  After expiry, `signalsDropped.membershipFinal` increments.
- WoT is **bypassed** for kinds 20078 + 25050 — `wotEngine` lists
  them in `ALWAYS_ALLOW_KINDS`. Voice trust is the per-channel member
  list, not WoT distance. WoT applies to surfaces where the user has
  no other filter (chat, profiles); inside a small per-channel voice
  room the operator's member list is the right gate.
