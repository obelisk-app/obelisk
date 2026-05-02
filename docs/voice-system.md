# Voice System

Obelisk voice/video/screenshare is **P2P WebRTC with Nostr-relay signaling**. There is no SFU, no LiveKit, no Socket.io — the same relay that carries chat carries the SDP/ICE/track-info exchange, and media flows directly between participants' browsers.

Wire-level detail (event kinds, presence beacons, gift-wrap upgrade plan, relay-operator notes) lives in [webrtc-p2p-nostr-signaling.md](webrtc-p2p-nostr-signaling.md). This doc covers the client-side architecture and what's currently shipped.

## Architecture

```
Browser A ─── WebRTC (DTLS-SRTP) ───▶ Browser B
   │                                     │
   └──── kind 25050 / 20078 ─────────────┘
              via Obelisk relay
            (signaling only — no media)
```

- **Mesh only**, capped at 4 participants. Each peer holds one `RTCPeerConnection` per remote peer; uplink is O(N−1).
- **Media is end-to-end** in the WebRTC sense — every track is wrapped in DTLS-SRTP between the two browsers. The relay never sees media. There is no third party in the media path to decrypt it.
- **Signaling is plaintext signed events** today (kinds 20078 + 25050). A NIP-59 gift-wrap upgrade is planned — see [webrtc-p2p-nostr-signaling.md §9](webrtc-p2p-nostr-signaling.md). Until then, the relay can see who is in which voice channel and the SDP/ICE payloads of session setup. Media is unaffected.
- **No TURN configured**. Public STUN only (Google + Cloudflare). Symmetric-NAT peers will fail to connect.

## Files

```
src/lib/voice/
  types.ts          VoiceSignalPayload, VoicePresence, VoiceTrackKind
  transport.ts      publishPresenceBeacon, subscribeRoster, sendSignal,
                    subscribeSignals — all over the bridge
  peer.ts           Peer — RTCPeerConnection wrapper, perfect negotiation,
                    track-slot routing, quality hints
  client.ts         VoiceClient — peer mesh + local media + roster +
                    deafen state for one channel
  active-client.ts  Cross-route singleton so navigating away from /voice
                    doesn't tear down the call
  quality.ts        Encoder presets (mic Opus 256 kbps, screen-audio
                    320 kbps, camera/screen bitrate caps)
  stats.ts          getStats() polling for the in-call HUD

src/components/voice/
  VoiceRoom.tsx     Room UI: gating, tile grid, controls, error states
  VoiceControls.tsx Mute / camera / screen / deafen / leave bar
  VoiceStatusBar.tsx Persistent "you're in voice" bar across the app

src/hooks/chat/useVoiceChatPane.ts   Companion text-chat slot in voice rooms
src/lib/nip-kinds.ts                  KIND_VOICE_PRESENCE / KIND_VOICE_SIGNAL / KIND_VOICE_MOD_ACTION
```

`server.ts`, `src/lib/livekit-voice.ts`, `src/app/api/voice/token/route.ts`, and the Socket.io `join-voice` / `voice-signal` / capacity-claim handlers from the legacy stack no longer exist in this repo.

## Channel = NIP-29 group with a `t=voice` marker

A voice channel is just a NIP-29 group whose kind 39000 metadata carries `["t", "voice"]`. Set this from channel settings → **Channel type → Voice / Video**, or programmatically via `bridge.editGroupMetadata({ kind: 'voice' })`. `JsGroup.kind` flips to `'voice'` on every subscribed client and the chat surface offers a "Join voice" entry instead of a text channel.

Membership and admin enforcement reuse NIP-29 kinds 39001 / 39002 — the voice client subscribes to both, drops presence beacons / signaling from non-members, and only honors moderator force-actions (kind 25051, reserved) signed by an admin.

## Track types

| Type           | Source                                    | Notes                                            |
|----------------|-------------------------------------------|--------------------------------------------------|
| `audio`        | `getUserMedia({ audio })` — the mic       | Drives deafen / per-peer mute via shared GainNode |
| `camera`       | `getUserMedia({ video })` — webcam        | `maintain-resolution`, bitrate cap from `quality.ts` |
| `screen`       | `getDisplayMedia({ video })`              | `maintain-resolution` + framerate hint            |
| `screen-audio` | `getDisplayMedia({ audio })` — tab audio  | Tuned to 320 kbps separately (music-grade)        |

Track kind is announced **out-of-band** as a `trackInfo` signal before the corresponding `RTCRtpSender` is added, so the receiver's `ontrack` knows which UI slot the track maps to before media starts. Kind-id mismatch falls back to draining unattached tracks by `kind`.

## Remote audio routing

Every remote audio track (mic + screen-audio) is connected to a per-peer `GainNode` in a shared `AudioContext` on the receiver:

```
MediaStreamAudioSourceNode (new MediaStream([track]))
   └─▶ GainNode (per peer, per kind)
         └─▶ AudioContext.destination
```

Why not `<audio>` elements? Browser autoplay policy fires per-element. With one shared `AudioContext`, the single Join-Voice click unlocks audio for every remote source for the rest of the session, and we get two features cheaply:

- **Deafen** — set every gain to 0; never sends server traffic.
- **Local per-user mute** — silence one peer in your own ear via `setPeerMuted(pk, true)`.

## Perfect negotiation

Polite/impolite is decided per peer pair: `polite = self.pubkey > remote.pubkey`. The polite side rolls back on offer glare; the impolite side ignores conflicting remote offers. Sequence numbers on the signaling payload let receivers drop out-of-order ICE without affecting offer/answer flow. Implementation: `Peer.handleSignal` in `peer.ts`.

## What's not yet shipped

These are tracked in [webrtc-p2p-nostr-signaling.md](webrtc-p2p-nostr-signaling.md) §1 and `docs/known-bugs.md`:

- **Reconnection ladder.** The peer doesn't currently drive ICE-restart / hard-reset on `'failed'`; a dropped connection requires leave/rejoin.
- **Speaking detector.** No per-peer RMS analyser → speaking orbs in the UI don't react to voice activity. Mute button reflects local state only.
- **Moderator force actions.** Receiver-side admin check exists; sender side (mute / camera-off / screen-off / kick from the UI) is not wired.
- **Capacity beyond 4.** Hard cap. The 5th joiner by lexicographic pubkey is rejected client-side; there is no SFU fallback.
- **TURN.** Public STUN only.
- **Encrypted signaling.** Plaintext ephemeral events; gift-wrap upgrade planned.

## Reaching a voice channel

Today the entry point is the URL `/voice/<groupId>`, plus deeplinks from chat-channel surfaces that detect `JsGroup.kind === 'voice'`. A dedicated "Voice channels" section in the sidebar with a Join button is follow-up work.

## Testing

- `src/lib/voice/peer.test.ts` — perfect-negotiation glare, ICE batching, track-info routing.
- `src/lib/voice/peer-pair.integration.test.ts` — end-to-end two-peer offer/answer over a fake transport.
- `src/lib/voice/client.test.ts` — roster/membership filtering, leave teardown, deafen state.
- `src/lib/voice/transport.test.ts` — beacon expiration parsing, drop-non-member.
- `src/lib/voice/quality.test.ts` / `stats.test.ts` — encoder presets and stats polling.

A two-device manual matrix is in [webrtc-p2p-nostr-signaling.md §7](webrtc-p2p-nostr-signaling.md).
