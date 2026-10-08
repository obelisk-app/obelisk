# DM calls - 1:1 voice and video, end to end encrypted

A person you DM can be called from the thread header (phone / camera
buttons). If their Obelisk tab is open and DMs are on, it rings with their
ringtone, like a DM chime. The media is WebRTC between the two browsers,
using the mesh engine's `Peer`.

Nothing here needs a server. The only infrastructure a call touches is:
- the recipient's NIP-17 inbox relays, for the invite;
- the **call relays** the caller picked, for the WebRTC setup;
- optionally our TURN server, when the call hides IP addresses.

## Code

| Path | What |
|---|---|
| `src/services/call/protocol.ts` | Control messages (invite / accept / decline / cancel / hangup / busy), parsing, freshness |
| `src/services/call/signaling.ts`, `signal-outbox.ts` | `CallSignalChannel`: kind 25050 on throwaway keys, NIP-44 content; the outbox numbers, batches and re-sends until acked |
| `src/services/call/call-pool.ts` | The call's transport: the page's relay hub under the call's own identity (`ephemeral:<callId>`, `authPolicy: 'never-auth'`) |
| `src/services/call/session.ts` | `DmCallSession`: one mesh `Peer`, rebuild / reconnect; capture in `local-media.ts`, the other side's streams in `remote-media.ts`, give-up timers in `call-liveness.ts`, shapes and limits in `session-config.ts` |
| `src/services/call/load-session.ts` | Fetches `session.ts` (and with it simple-peer) on demand: when a call starts, when an invite rings, when the pointer reaches the call buttons. Nothing in the shell imports the session statically |
| `src/store/call/dm-call.ts` | The state machine and the inbound router; the store and its actions are `dm-call-store.ts`, "who can ring me" and the IP policy `dm-call-policy.ts`, timers and the live session `dm-call-runtime.ts` (none of which imports the session statically) |
| `src/hooks/call/useDmCallListener.ts` | Listens for call messages while logged in; mounted by `LazyDmCallLayer` (`src/app/[locale]/app/mounts/lazy-mounts.tsx`), which ships with the shell, so an invite never waits on a download |
| `src/services/nostr-bridge/dm/calls.ts` | `sendDmCallMessage`, `subscribeDmCallMessages`, `sealAndWrapExpiring`; holds a fresh message that arrives before anyone listens and hands it to the first listener |
| `src/services/notifications/sound.ts`, `alert.ts` | `ring` / `ringback` phrases per ringtone; `ringIncomingCall`, `startRingback` |
| `src/components/call/` | `DmCallButtons`, `DmCallLayer` (banner + call view + remote audio) |
| `src/components/settings/notifications/CallSettings.tsx` | Who can call, IP protection, call relays |

## Wire

### 1. Control: gift-wrapped DMs

Control messages are rumors of kind **25055** (`KIND_DM_CALL_RUMOR`), sealed
and gift-wrapped exactly like a kind-14 chat message and routed by the same
inbox ladder (`resolveGiftWrapRelays`, `authMode: 'last-resort'`). The
content is JSON:

```json
{ "v": 1, "type": "invite", "callId": "<32 bytes hex>", "eph": "<throwaway pubkey>",
  "relays": ["wss://…"], "video": true }
```

- `accept` carries the callee's own `eph`.
- The other types carry just `type` and `callId`.

Differences from a chat message:

- **The wrap has a NIP-40 `expiration`, 5 minutes out.**
  - That stops inbox relays from keeping a log of every call.
  - The cost is that a relay can tell an expiring wrap from a chat wrap. See [What this does not hide](#what-this-does-not-hide).
- **There is no self-copy for history.**
  - The exception is `accept` and `decline`, which are also wrapped to ourselves.
  - That way our other devices stop ringing ("answered on another device").
- **Freshness is checked against the rumor's `created_at`.**
  - That timestamp is not fuzzed; the seal's and the wrap's are.
  - Anything older than 60 s is dropped in the bridge, so a reconnect's backlog never rings.
- **Control messages never enter `dmsByPeer`.** They go to `subscribeDmCallMessages` listeners.

### 2. Negotiation: throwaway keys on the call relays, delivered reliably

Each side mints a keypair for the call and reveals only the public half,
inside the gift-wrapped invite / accept. Negotiation events are kind 25050
signed by that throwaway key, `["p", <other throwaway key>]`,
`["t", "obelisk-dm-call"]`, `["expiration", now+120]`, with NIP-44 content
between the two throwaway keys:

```json
{ "v": 2, "callId": "…", "m": [{ "i": 3, "b": { "t": "sig", "s": <VoiceSignalPayload> } }], "a": [5, 6] }
```

**Kind 25050 is ephemeral**: a relay forwards it to REQs open at that
instant and stores nothing. The first version sent the offer the moment the
accept arrived, and the answer the moment the offer did. Whenever the other
side's REQ wasn't live yet, or a relay dropped an event under rate limiting,
the message was gone and the call sat out a 12 s connect timeout: the
"sometimes instant, sometimes never" behaviour. `CallSignalChannel` now:

- **numbers every message** (`i`), **acks** what it received (`a`), and
  **re-sends** anything unacked every ~1.2 s (jittered ±25 %, so the two
  sides never re-send in lockstep), up to 10 times; each number is delivered
  once;
- **batches**: an offer and its trickle of ICE candidates, plus acks, ride
  in one event (40 ms window, capped well under NIP-44's 64 KiB);
- exposes **`ready`**, resolved on EOSE: the REQ is live from then on;
- lets a side **drop the re-sends of a torn-down negotiation**
  (`dropSession`), and the receiver ignores any message numbered before the
  newest offer that belongs to another session, so a late re-send can never
  drag a rebuilt connection back.

`CallSignalChannel` runs on the page's relay hub, but under the call's
**own** identity (`call-pool.ts`): `ephemeral:<callId>` with
`authPolicy: 'never-auth'`. The hub keys sockets on `(relay, identity)`, so
the call's REQs and EVENTs never ride a socket the user's session uses,
even on a relay the user is browsing, and those sockets never answer a
NIP-42 challenge with any key. A socket that drops mid-call is re-opened by
the hub and the REQ re-issued, so a later renegotiation still gets through;
`destroy()` removes the identity, and with it the call's sockets, when the
call ends. So the call relay sees two random keys trading opaque blobs (not
who is calling whom, not the call id, not the SDP, and so not the IP
addresses in it). It still sees one IP for both the session's connection
and the call's, if the user is on that relay: this removes the
cryptographic link AUTH would create, not network-level correlation. And a
relay that whitelists real npubs (the group relays, `public.obelisk.ar`)
cannot carry a call, since the call never authenticates. That is why call
relays are a separate list, `preferences.callRelays` (default
`relay.damus.io`, `nos.lol`; Settings → Privacy → Calls). The caller's list
travels in the invite, so both sides use the same ones.

No presence beacon (kind 20078) is published for a DM call.

## Call flow

```
caller                                        callee
startCall ─ acquire media ─ listen()  (REQ on own eph, live while it rings)
          ─ invite (gift wrap) ─────────────▶ rings (if mayRing)
                                              acceptCall ─ acquire media
                                                ├─ answer(): REQ on own eph → EOSE → hello ─┐
                                                └─ accept (gift wrap, + self notice) ───┐   │
learns callee eph from the hello ◀──────────── (call relay, re-sent until acked) ───────┼───┘
  (or from the accept, whichever first)  ◀──────────────────────────────────────────────┘
build Peer, offer ── reliable ──────────────▶ Peer answers ── reliable ──▶
          ◀══════════ WebRTC media (DTLS-SRTP), control data channel ══════════▶
hangup ─ Peer bye (call relay) + hangup (gift wrap) ─▶ ends
```

The caller offers only once it has heard the callee's hello (or the accept)
*and* its own REQ is live, so both subscriptions exist before anything that
matters is sent. The hello usually beats the gift-wrapped accept, which
needs a signer round trip and an inbox relay.

Recovery reuses the mesh semantics (the caller is the impolite side; on an
open timeout or lost heartbeat it rebuilds with a fresh `sessionId` and
`requestReset`, and the callee follows the new offer
(`onRemoteSessionChanged`)), but with reliable delivery a rebuild is now the
exception rather than the normal cost of a lost event. A call that hasn't
connected 40 s after the rendezvous ends `connect-failed`; one that connected
and stays down 30 s ends `connection-lost`.

## Policies

- **Who can ring you:** `preferences.callsFrom`.
  - `contacts` (the default) means people in your kind-3 follow list; `anyone` is everyone.
  - Blocked and muted pubkeys never ring.
  - An invite that fails the check is dropped silently. The caller just sees no answer.
- **Busy:** an invite that arrives while a call is in progress gets a `busy` reply.
- **Group voice:** starting or accepting a DM call leaves any group voice channel first, since there is only one microphone.
- **IP protection:** `preferences.callIpProtection`.
  - A direct WebRTC call shows each side the other's IP address.
  - `auto` (the default) forces `iceTransportPolicy: 'relay'` with anyone you don't follow, so traffic goes through our TURN server.
  - `always` forces it for every call; `never` never does.
  - `auto` only forces relay when TURN is configured (`HAS_TURN`), because relay-only with no TURN can't connect at all.
  - `always` forces it regardless: failing is more honest than leaking.
- **Ringing:** goes through the notification stack.
  - It uses the user's ringtone (a `ring` phrase in every ringtone family) and loops every 2.4 s.
  - The caller hears a quiet `ringback`.
  - Muting notification sounds mutes the ring too.
  - When the tab is backgrounded, or the page has had no user gesture yet so audio is blocked, a sticky OS notification is raised.
  - The notification shows the name in the title and "Incoming call" in the body, the same rule DM popups follow.
- **Ring time:** 45 s, then the caller sends `cancel` and the callee shows "Missed call".

## What this does not hide

- **Timing.** The callee's inbox relays see an expiring gift wrap arrive; the call relays see two fresh keys start talking shortly after. A party watching both could correlate "someone with this inbox got called" with "a call happened on this relay". It still can't read either side.
- **Expiring wraps are distinguishable** from chat wraps by their `expiration` tag. That is the trade for not leaving a permanent record of every call on inbox relays.
- **The other person's IP**, on a direct call. That is what IP protection is for.
- **TURN sees both IPs** on a relayed call. It sees traffic volume but not content, which is DTLS-SRTP end to end.
- **It only rings while Obelisk is open.** There is no push without a server.
- **A NIP-04-only peer** can't be called. Invites are always gift-wrapped.

## Tests

- `tests/services/call/protocol.test.ts`: parse, validation, freshness.
- `tests/services/call/signaling.test.ts`: learning the peer from its hello, delivery to a REQ that went live late, re-send until acked / exactly-once, batching, give-up, stale-session purge, strangers ignored, size cap.
- `tests/services/call/call-pool.test.ts`: on the real hub, the call's REQs and EVENTs use a socket of their own and never answer AUTH, even on a relay the session is authenticated to.
- `tests/services/call/session.test.ts`: two real sessions over `tests/support/fake-ephemeral-relay.ts` (a relay that keeps nothing and forwards only to live REQs): connect via hello alone, via the accept alone, and without a rebuild under slow REQs and 30-50 % seeded random loss; bye, give-up, reconnect timeout, caller rebuild followed by the callee, hangup. `call-liveness.test.ts`, `remote-media.test.ts`, `session-config.test.ts` and `load-session.test.ts` cover the parts.
- `tests/store/call/dm-call.test.ts`, `dm-call-store.test.ts`, `dm-call-policy.test.ts`, `dm-call-runtime.test.ts`, `dm-call-lazy.test.ts`: the state machine, contacts-only, busy, answered elsewhere, IP policy, and (`dm-call-lazy`) an invite that rings and no call lost or doubled while the session download is slow or fails.
- `tests/services/nostr-bridge/dm-nip17.test.ts` (`DM call control messages`): expiring wrap, listener delivery, stale drop, self notice.
- `tests/services/notifications/sound.test.ts`: the ring loop.
- `tests/components/call/DmCallLayer.test.tsx`, `tests/components/settings/notifications/CallSettings.test.tsx`, `tests/app/[locale]/app/mounts/lazy-dm-call.test.tsx`.
