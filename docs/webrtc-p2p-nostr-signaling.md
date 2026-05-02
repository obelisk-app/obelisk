# Voice channels (P2P WebRTC over Nostr)

Obelisk voice/video/screenshare channels. **Media is P2P** between participants over WebRTC; **signaling is Nostr** — no `server.ts`, no SFU, no media server. The Obelisk relay is the only piece of infrastructure involved, and only as a postbox for short-lived signed events.

This doc describes what's actually in `main` today (v1). §9 sketches the gift-wrap upgrade we plan to swap in once we have a NIP-07–compatible NIP-44 path.

## 1. What v1 ships

- **Audio + camera video + screenshare** (with screen-audio) for **up to 4 participants** in a channel.
- **Channel = NIP-29 group** with a `["t", "voice"]` marker on its kind 39000 metadata. Set this from the channel settings modal (Channel type → "Voice / Video"). Existing NIP-29 admin/member machinery is reused unchanged.
- **Membership-gated**: the receiver checks every incoming presence + signaling event against the channel's NIP-29 member list (kind 39002). The local user must be a member to publish a beacon. Empty member-list policy: **block with a spinner** until the list arrives (~1–2 s normally; 8 s timeout surfaces an error).
- **Mute + camera toggle + screen toggle + leave**.
- **Perfect negotiation** for SDP glare (MDN pattern; polite side = lexicographically-greater pubkey).

What's **not** in v1, but planned:
- Moderator force-mute / force-camera-off / force-screen-off (kind 25051 reserved; receiver-side admin check exists, sender side not yet wired into UI).
- Reconnection ladder, speaking detector, deafen, local per-peer mute.
- Encryption of signaling (see §9 — gift-wrap upgrade).
- A "Voice channels" section in the chat sidebar with a join button (today you reach a voice channel only by visiting `/voice/<groupId>` directly or being deeplinked).
- Admin-CLI integration. There is no admin CLI in obelisk-dex yet; once one exists, a `voice-channel` create/edit subcommand should be added.

## 2. Files

```
src/lib/voice/
  types.ts        VoiceSignalPayload, VoicePresence, VoiceTrackKind
  transport.ts    publishPresenceBeacon, subscribeRoster, sendSignal, subscribeSignals
  peer.ts         RTCPeerConnection wrapper with perfect negotiation + track slots
  client.ts       VoiceClient — orchestrates presence, peer mesh, local media
src/components/voice/
  VoiceRoom.tsx   Self-contained room UI: gating, tile grid, controls
src/app/voice/
  page.tsx                Landing form (enter group id)
  [channelId]/page.tsx    Mounts <VoiceRoom channelId={…}/>
src/lib/nip-kinds.ts        KIND_VOICE_PRESENCE / KIND_VOICE_SIGNAL / KIND_VOICE_MOD_ACTION
src/lib/nostr-bridge/
  client.ts       publishEvent, subscribeFilter, getAdmins, getMembers,
                  ingest "t=voice" marker on metadata,
                  editGroupMetadata({...kind})
  types.ts        JsGroup.kind: 'text' | 'voice'; createGroup/editGroupMetadata kind option
src/app/app/AppShell.tsx
  ChannelSettingsModal     "Channel type" selector → emits kind 9002 with/without ["t","voice"]
```

## 3. Marking a channel as voice

**From the UI** (recommended): open any channel you're an admin of → channel settings → **Channel type** → **Voice / Video** → Save metadata. The save publishes a kind 9002 event with a `["t","voice"]` tag; the relay reflects it on the channel's kind 39000 like any other tag, and `JsGroup.kind` flips to `'voice'` for everyone subscribed.

You can flip a channel back to text the same way (the tag is simply omitted on the next save).

**Programmatically**: pass `kind: 'voice'` to either `bridge.createGroup({...})` (new channel born as voice) or `bridge.editGroupMetadata({...})` (convert existing channel). Same kind-9002 mechanic; one path.

## 4. Wire formats

All v1 signaling rides as **plaintext signed ephemeral events**. Kinds in 20000–29999 are ephemeral per NIP-01 (relays MUST NOT store), and we set `["expiration", …]` per NIP-40 as a belt-and-braces signal. Rationale for not gift-wrapping yet: `nostr-tools` NIP-59 wrap requires a private key and breaks for NIP-07 logins. See §9 for the upgrade plan.

### 4.1 Presence beacon — kind `20078`

```jsonc
{
  "kind": 20078,
  "tags": [
    ["e", "<channelId>"],            // NIP-29 group id
    ["t", "obelisk-voice-presence"],
    ["expiration", "<now+30>"]       // NIP-40
  ],
  "content": ""
}
```

Re-published every 15 s while the user is in the channel. The roster is computed by subscribers as: pubkeys whose newest beacon for `#e=<channelId>` has `expiration > now`. The client keeps only the most recent beacon per pubkey and sweeps stale entries every 15 s.

### 4.2 Signaling — kind `25050`

Directed at one peer via `["p", recipient]`.

```jsonc
{
  "kind": 25050,
  "tags": [
    ["p", "<recipientPubkey>"],
    ["e", "<channelId>"],
    ["t", "obelisk-voice-signal"]
  ],
  "content": "{\"type\":\"offer|answer|ice|bye\",\"sdp\":...,\"candidates\":[...],\"trackInfo\":{...},\"sessionId\":\"...\",\"seq\":17}"
}
```

`trackInfo: { trackId, kind: 'audio' | 'camera' | 'screen' | 'screen-audio' }` is announced out-of-band before the corresponding RTCRtpSender so the receiver's `ontrack` knows which UI slot the track maps to.

### 4.3 Moderator force action — kind `25051` (reserved, not yet sent)

```jsonc
{
  "kind": 25051,
  "tags": [["p", "<targetPubkey>"], ["e", "<channelId>"]],
  "content": "{\"action\":\"mute|camera-off|screen-off|kick\",\"reason\":\"...\"}"
}
```

Receiver verifies the signer is in the channel's kind-39001 admin list before acting.

## 5. Authorization model

Pure client-side, pure Nostr. There is no extra "voice ticket" or auth token.

| Step | Check |
|---|---|
| Page mount | Subscribe to NIP-29 admins (kind 39001) + members (kind 39002) for the channel. |
| Members list arrived, local pubkey ∈ members? | Mount `VoiceClient` and join. |
| Members list arrived, local pubkey ∉ members? | Render "you aren't a member" panel. |
| Members list still empty after 8 s? | Surface error, do not join. |
| Incoming presence beacon | Drop unless author ∈ members. |
| Incoming signaling event | Drop unless author ∈ members. |
| Incoming mod-action (kind 25051) | Drop unless author ∈ admins. |

Membership / admin-list updates flow into the running `VoiceClient` via `updateRoles(members, admins)`; peers from pubkeys that just dropped out of the member set are torn down immediately.

## 6. Mesh + perfect negotiation

- Up to 4 participants. Beyond that the latecomers see themselves as "5th" by lexicographic pubkey ordering and refuse to join — deterministic across all clients.
- Each peer maintains one `RTCPeerConnection` per other peer. ICE servers: public STUN (Google + Cloudflare) only. **TURN is not configured by default**; users behind symmetric NAT will fail to connect with a `peer connection failed` console warning. Adding TURN is operator-config follow-up work.
- Polite/impolite per peer pair: `polite = self.pubkey > remote.pubkey`. Polite side rolls back on offer glare; impolite side ignores conflicting remote offer. Implementation: `Peer.handleSignal` in `src/lib/voice/peer.ts`.

## 7. How to test on two devices

Prerequisites:
- Both devices logged into the same Obelisk instance with two different Nostr keys.
- A NIP-29 group that contains both pubkeys as members.

### 7.1 Mark a channel as voice

1. From any logged-in admin: open the channel → ⚙️ settings.
2. Set **Channel type → Voice / Video**.
3. Save metadata. The channel is now voice — `JsGroup.kind === 'voice'` on every subscribed client.
4. Use the **Add member** form to add the second tester's npub or hex pubkey if they're not already in.

### 7.2 Join from both devices

Each device opens `https://<your-obelisk>/voice/<channelId>`. (You can also hit `/voice` to get a small landing form that asks for the channel id.) Expect:

1. Spinner ("Loading channel membership…") for ~1–2 s while admins/members streams populate.
2. Browser asks for mic permission; mic turns on by default.
3. Each device sees the other in the tile grid; you should hear each other.
4. Click **Camera on** — your video appears in the other tile.
5. Click **Share screen** — pick a window/screen; the screen tile renders below the grid.
6. Click **Stop sharing** / **Camera off** / **Mic off** — corresponding senders are removed and the other side stops receiving them.
7. Click **Leave** — beacon stops, peer connections close, you bounce to `/`.

### 7.3 What success looks like in DevTools

- Network tab: only the relay WebSocket has traffic. **No HTTP requests carry media bytes** — that's how you know media is P2P.
- `chrome://webrtc-internals` (or the equivalent): one PeerConnection per remote participant; `ICE connection state: connected`.
- The relay sees: kind 20078 beacons every 15 s from each participant, kind 25050 events for offer/answer/ICE during call setup, and `bye` events on leave.

### 7.4 Two devices on the same LAN

Public STUN works fine for most home networks. If both devices are on the *exact same* NAT and the connection fails, that's a known WebRTC oddity (some routers block hairpin) — try a phone on cellular as the second device. TURN would fix this; not configured in v1.

## 8. Relay operator notes (Obelisk relay)

We own the relay source, so we can enforce these properties server-side. The protocol is correct without the relay's help — the receiver always checks — but a cooperating relay reduces wasted bandwidth and gives peers cleaner roster behavior. Implement in this order:

1. **Honor NIP-01 ephemeral kinds (20000–29999).** Don't persist. Forward to current subscribers only. The voice presence beacon (20078), signaling (25050), and mod-action (25051) all live in this range deliberately.
2. **Honor NIP-40 `["expiration", <ts>]`.** Drop matching events from any in-memory delivery queue once `now > expiration`. The voice beacon TTL is 30 s; without this, late-joining roster subscribers can briefly see a peer who already left.
3. **Drop voice signaling that the sender pubkey isn't authorized to send.** Specifically: for any kind 25050 / 25051 / 20078 with `["e", <channelId>]`, reject if `sender.pubkey ∉ members(<channelId>)` for 25050 / 20078, or `sender.pubkey ∉ admins(<channelId>)` for 25051. This is defense in depth — the receiver enforces this anyway, but blocking at the relay saves every other subscriber a wasted parse. Use the relay's existing NIP-29 group state to answer the membership query.
4. **Optional: `#e`-indexed roster query fast-path.** Filter `{ kinds: [20078], "#e": [channelId], limit: 50 }` is already standard Nostr; we just want it served from a per-channel in-memory index for O(1) cold-join roster fetch instead of scanning all live ephemerals. Not a protocol change.
5. **Rate-limit per-pubkey-per-kind for 25050.** Trickle ICE bursts ~10 events in the first ~2 s; legitimate traffic peaks around 30 events / minute / pubkey. Anything above ~120 events / minute / pubkey for kind 25050 should be rejected with `RESTRICTED`.

What the relay must **not** do:
- Persist any of these kinds.
- Echo voice signaling to anyone other than the recipient identified by the `#p` tag (when the relay supports targeted delivery for ephemerals).
- Synthesize or modify these events. The voice client trusts the cryptographic signature; tampering is detectable but wastes bandwidth.

## 9. Future: gift-wrapped signaling (planned upgrade)

Once we have a NIP-07-compatible NIP-44 signer wrapper (work tracked separately; the bridge currently only supports NIP-04 via the extension), we'll wrap kinds 25050 + 25051 into NIP-59 gift wraps (kind 1059) sealed to the recipient. The wire format above becomes the **rumor** kind inside the wrap. Implications:

- Relay no longer sees `["e", channelId]` or `["p", recipient]` on the outer event — only the wrap's random sender pubkey and `["p", recipient]`. So the relay-side authorization check (item 3 above) stops working for 25050/25051 and falls back to the receiver alone. Beacons (20078) stay plaintext because the roster is by definition observable by all members.
- ICE candidate batching becomes important for relay budget; document a 200 ms initial window, 500 ms steady-state.
- Receiver verifies the *rumor's* signer pubkey, not the wrap's, against members/admins.

This is a transparent swap inside `src/lib/voice/transport.ts`; no public API changes.

## 10. Failure modes

| Case | Behavior |
|---|---|
| Relay down | Bridge surfaces "Disconnected"; voice page sits in spinner until reconnect. |
| Symmetric NAT both sides, no TURN | `RTCPeerConnection.connectionState` → `failed`; remote tile stays empty. v1 logs a console warning and does not retry. |
| Member kicked mid-call | They stop publishing beacons; their tile clears within 15 s. (Active-kick via mod action: future.) |
| 5th joiner | Lexicographic-pubkey loser sees only 3 of the 4 in the roster, can't establish a 5th peer. (Hard cap; explicit "channel-full" UX is follow-up.) |
| Page refresh / network blip | All current peers tear down and re-establish on the next beacon cycle. There is no resume. |

## 11. Tests (planned)

- `src/lib/voice/__tests__/transport.test.ts` — beacon expiration parsing, roster diffing, drop-non-member.
- `src/lib/voice/__tests__/peer.test.ts` — perfect-negotiation glare, ICE batching, track-info routing.

Manual verification matrix is in §7. Per CLAUDE.md the unit tests are owed before this is considered "done"; they were skipped in the v1 push to get a working two-device demo, and are the next thing to land.
