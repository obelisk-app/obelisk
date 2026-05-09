# Mesh — Wire Protocol

Two Nostr event kinds + one in-PC data channel:

| Kind | Direction | Purpose |
|---|---|---|
| **20078** (presence beacon) | broadcast (`#e` = channel id) | publisher-is-alive, with `p`-tags for transitive roster discovery |
| **25050** (signal envelope) | directed (`#p` = recipient) | SDP offer/answer/ICE/trackinfo/qualityhint/bye/requestReset, JSON-encoded in `content` |
| **`obelisk-control` data channel** | per-peer-pair, ordered | hello, ping/pong, peerAdded/peerRemoved, bye |

## Presence beacon (kind 20078)

```jsonc
{
  "kind": 20078,
  "content": "",
  "tags": [
    ["e", "<channel-id>"],
    ["t", "obelisk-voice-presence"],
    ["expiration", "<unix-seconds, +30 from publish>"],
    ["p", "<connected-peer-pubkey>"], // 0..N — peers we have a live PC to
    ["v", "camera"], ["v", "screen"],  // 0..2 — outbound video tracks
    ["sfu", "1"]                        // present iff this client is an SFU node
  ]
}
```

Cadence:

- **Steady state**: every 15 s (`BEACON_INTERVAL_MS`).
- **Bring-up burst**: at join, additional publishes scheduled at
  `[500, 1500, 3500, 7000, 12000]` ms (`BEACON_BRINGUP_DELAYS_MS`) so
  a peer who joined a few seconds before us discovers us within
  seconds, not 15 s.
- **Refresh on connect/disconnect**: when our `connectedTo` set
  changes, schedule a debounced beacon (~250 ms) so the new edge
  shows up in everyone's transitive roster within a single hop.

The receiver dedups by `(pubkey, created_at)` — newer beacons replace
older ones; expired beacons (`expiration` past) are swept out by
`subscribeRoster`'s `(PRESENCE_TTL_SECONDS / 2) * 1000` interval.

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

Delays: `RECONNECT_DELAYS_MS = [1000, 2500, 5000, 10000, 15000]` for
impolite; `POLITE_RESET_DELAYS_MS = [6000, 10000, 16000]` for polite.

## Control channel (`obelisk-control`)

A single ordered RTCDataChannel per peer pair, opened immediately
after PC construction. **Only the impolite side calls
`createDataChannel`**; the polite side adopts via `pc.ondatachannel`.
Symmetry matters — both sides creating would produce two channels per
pair, doubling heartbeat and hello traffic.

```ts
type ControlMessage =
  | { type: 'hello'; peers: string[]; sessionId: string; build: string }
  | { type: 'peerAdded'; pubkey: string }
  | { type: 'peerRemoved'; pubkey: string }
  | { type: 'bye'; reason: string }
  | { type: 'ping'; ts: number }
  | { type: 'pong'; ts: number; echoTs: number };
```

Lifecycle (constants in `src/lib/voice/control-channel.ts`):

- **Open timeout**: 10 s. If `dc.readyState` doesn't reach `'open'`,
  fire `onDead('open-timeout')` so the owner tears the peer down
  rather than waiting forever for a dead PC.
- **Heartbeat**: ping every 2.5 s. Pong response carries `echoTs` →
  RTT measurement.
- **Dead-peer timer**: 7 s without ANY inbound traffic (ping, pong,
  hello, peerAdded/Removed) → `onDead('heartbeat-lost')`.
- **Bye**: synchronous send via `dc.send` BEFORE `pc.close()` →
  remote receives within ~10 ms.

Discovery propagation:

- On open, send `hello { peers: this.connectedPubkeys, sessionId, build }`.
- Whenever a new peer connects, send `peerAdded { pubkey }` to every
  OTHER peer.
- Whenever a peer disconnects, send `peerRemoved { pubkey }` to every
  OTHER peer.

The receiver feeds these into the `DiscoveryEngine`
(`src/lib/voice/discovery.ts`), which tracks `(pubkey, viaPeer)` so a
single peer's `peerRemoved` doesn't drop someone other peers still
claim.

## Hangup paths (in priority order)

1. **Control-channel `bye`** — primary. Sent synchronously over the
   data channel before `pc.close()`. Other side receives within
   ~10 ms; `onPeerDead('bye:local-leave')` fires immediately.
2. **Control-channel heartbeat-lost** — backup. 7 s after the last
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
  Signals from non-members are deferred for up to
  `DEFERRED_SIGNAL_TTL_MS = 5_000` ms; if `updateRoles()` admits the
  sender within that window the queue replays through `routeSignal`.
  After expiry, `signalsDropped.membershipFinal` increments.
- WoT is **bypassed** for kinds 20078 + 25050 — `wotEngine` lists
  them in `ALWAYS_ALLOW_KINDS`. Voice trust is the per-channel member
  list, not WoT distance. WoT applies to surfaces where the user has
  no other filter (chat, profiles); inside a small per-channel voice
  room the operator's member list is the right gate.
