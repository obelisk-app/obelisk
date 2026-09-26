# DM calls — 1:1 voice and video, end to end encrypted

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
| `src/lib/dm-call/protocol.ts` | Control messages (invite / accept / decline / cancel / hangup / busy), parsing, freshness |
| `src/lib/dm-call/signaling.ts` | `CallSignalChannel`: kind 25050 on throwaway keys, NIP-44 content, its own `SimplePool` |
| `src/lib/dm-call/session.ts` | `DmCallSession`: local media, one mesh `Peer`, rebuild / reconnect |
| `src/store/dm-call.ts` | The state machine, "who can ring me", IP policy, ringing |
| `src/lib/nostr-bridge/client.ts` | `sendDmCallMessage`, `subscribeDmCallMessages`, `sealAndWrapExpiring` |
| `src/lib/notifications/sound.ts`, `alert.ts` | `ring` / `ringback` phrases per ringtone; `ringIncomingCall`, `startRingback` |
| `src/components/call/` | `DmCallButtons`, `DmCallLayer` (banner + call view + remote audio) |
| `src/components/settings/CallSettings.tsx` | Who can call, IP protection, call relays |

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

### 2. Negotiation: throwaway keys on the call relays

Each side mints a keypair for the call and reveals only the public half,
inside the gift-wrapped invite or accept. Negotiation events then go out as
follows:

- Kind 25050, signed by the throwaway key.
- `["p", <other throwaway key>]`, `["t", "obelisk-dm-call"]` and `["expiration", now+120]`.
- Content is NIP-44 between the two throwaway keys, holding `{ callId, payload }`.
- `payload` is the mesh's `VoiceSignalPayload` (simple-peer SDP, ICE, trackinfo, bye).

`CallSignalChannel` uses its **own** `SimplePool`. The bridge's pool answers
NIP-42 AUTH with the user's real key; this one answers only with the
throwaway key. Consequences:

- The call relay sees two random keys trading opaque blobs for a few seconds.
  - It does not see who is calling whom.
  - It does not see the call id.
  - It does not see the SDP, and so not the IP addresses inside it.
- A relay that whitelists real npubs cannot carry a call.
  - Group relays such as `public.obelisk.ar` are in that category.
  - This is why call relays are a separate list, `preferences.callRelays`.
  - It defaults to `relay.damus.io` and `nos.lol`, and is editable in Settings → Privacy → Calls.
  - The caller's list travels in the invite, so both sides use the same relays.

No presence beacon (kind 20078) is published for a DM call. The two sides
found each other through the invite, so nothing announces the call on any
relay.

## Call flow

```
caller                                   callee
startCall ─ acquire mic/cam, ringback
          ─ invite (gift wrap) ────────▶ rings (if mayRing)
                                         acceptCall ─ acquire media
                                                     ─ openSignaling(caller eph)   ← subscribe first
          ◀──────── accept (gift wrap) ─ ─ accept(own eph) + self notice
openSignaling(callee eph), connect ─ offer (kind 25050) ─▶ Peer answers
          ◀══════════ WebRTC media (DTLS-SRTP), control data channel ══════════▶
hangup ─ Peer bye (call relay) + hangup (gift wrap) ─▶ ends
```

Recovery reuses the mesh semantics:
- **Caller is the impolite side.** simple-peer's initiator.
- **Timeout or lost heartbeat:**
  - The caller rebuilds with a fresh `sessionId` and sends `requestReset`.
  - The callee follows the new offer through `onRemoteSessionChanged`.
- **Gives up:** after 4 rebuilds on a call that never connected (`connect-failed`), or after 30 s down on one that did (`connection-lost`).

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

- `src/lib/dm-call/protocol.test.ts`: parse, validation, freshness.
- `src/lib/dm-call/signaling.test.ts`: throwaway-key round trip, opacity on the wire, peer pinning, close.
- `src/lib/dm-call/session.test.ts`: roles, attach, bye, rebuild and give-up, reconnect timeout, hangup.
- `src/store/dm-call.test.ts`: the state machine, contacts-only, busy, answered elsewhere, IP policy.
- `src/lib/nostr-bridge/dm-nip17.test.ts` (`DM call control messages`): expiring wrap, listener delivery, stale drop, self notice.
- `src/lib/notifications/sound.test.ts`: the ring loop.
- `src/components/call/DmCallLayer.test.tsx`, `src/components/settings/CallSettings.test.tsx`.
