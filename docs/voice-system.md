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

- **Mesh only**, capped at **8 audio participants** (`MAX_PARTICIPANTS`). Each peer holds one `RTCPeerConnection` per remote peer; uplink is O(N−1) for audio.
- **Video-slot cap of 4** (`MAX_VIDEO_SLOTS`) across the entire room — camera and screen-share counted in the same pool. Examples: 4 cameras, or 2 cameras + 2 screens, or 1 camera + 3 screens. Beyond 4, the camera/screen buttons disable in the UI; race-overflow (two peers claim simultaneously) is resolved deterministically by `(beaconCreatedAt asc, pubkey asc)` — the holders outside the leading slice locally evict their own video and surface a "Video room is full" toast.
- **Media is end-to-end** in the WebRTC sense — every track is wrapped in DTLS-SRTP between the two browsers. The relay never sees media. There is no third party in the media path to decrypt it.
- **Signaling is plaintext signed events** today (kinds 20078 + 25050). A NIP-59 gift-wrap upgrade is planned — see [webrtc-p2p-nostr-signaling.md §9](webrtc-p2p-nostr-signaling.md). Until then, the relay can see who is in which voice channel and the SDP/ICE payloads of session setup. Media is unaffected.
- **Transitive beacon discovery** — every presence beacon advertises the publisher's currently-connected peers as `p` tags. A fresh joiner whose relay drops some publishers' beacons still discovers them via the `p`-tag list of any beacon they DO receive. Mesh formation converges from any starting position, even with asymmetric beacon delivery.
- **Reconnect ladder** on every peer: ICE restart up to 3× then hard reset (close + rebuild PC + re-attach senders). Polite side waits longer and emits `requestReset` so the impolite peer drives the rebuild without offer glare. Initial-handshake watchdog (15 s) catches PCs that never reach `'connected'`.
- **No TURN configured**. Public STUN only (Google + Cloudflare). Symmetric-NAT peers will fail to connect unless `NEXT_PUBLIC_TURN_URLS` is set.

## Files

```
src/lib/voice/
  types.ts            VoiceSignalPayload, VoicePresence (now with connectedTo),
                      VoiceTrackKind, LocalTracks
  transport.ts        publishPresenceBeacon (emits p-tags for connected peers),
                      subscribeRoster, sendSignal, subscribeSignals,
                      transitiveParticipants
  peer.ts             Peer — perfect negotiation + reconnect ladder + watchdog
  client.ts           VoiceClient — peer mesh + local media + roster +
                      deafen state + per-peer mute API + speaking-detector
                      wiring + opportunistic beacon refresh
  active-client.ts    Cross-route singleton so navigating away from /voice
                      doesn't tear down the call
  speaking-detector.ts SpeakingDetector — RMS VAD with hangover, shared
                      AudioContext for the receiver
  quality.ts          Encoder presets (mic Opus 256 kbps, screen-audio
                      320 kbps, camera/screen bitrate caps)
  stats.ts            getStats() polling for the in-call HUD

src/components/voice/
  VoiceRoom.tsx       Room UI: gating, tile grid, controls, fullscreen
  VoiceControls.tsx   Mute / camera / screen / deafen / leave bar
  VoiceStatusBar.tsx  Persistent "you're in voice" bar across the app
  fullscreen.ts       toggleFullscreen + useFullscreenState helper

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

Each remote audio track (mic + screen-audio) plays through a per-peer `<audio>` element rendered inside the corresponding tile in `VoiceRoom`. The element's `.muted` attribute binds to the local-listener controls:

- **Deafen** — `useVoiceStore().isDeafened` is true → every tile's `<audio>.muted = true`. Never sends relay traffic.
- **Per-peer mute-for-me** — `useVoiceStore().localMutedPubkeys[pubkey]` is true → that one tile's `<audio>.muted = true`. Per-tile button toggles. No relay traffic.

Tiles wrap both their `<video>` and `<audio>` in a single container so `requestFullscreen()` carries audio with the video — a `<video>`-only fullscreen would detach the sibling `<audio>` from the focus surface and Safari has been observed to mute it.

A shared `AudioContext` runs the speaking-detector AnalyserNode for each remote mic track (read-only — the analyser is never connected to `destination`). The Join Voice click resumes the context so all subsequent detectors function without further user gestures.

## Video quality

Six outbound presets (`src/lib/voice/quality.ts`):

| Tier      | Resolution | FPS | Bitrate cap |
|-----------|------------|-----|-------------|
| `auto`    | hint 720p  | 30  | unset (encoder picks) |
| `480p`    | 854 × 480  | 30  | 1.5 Mbps |
| `720p`    | 1280 × 720 | 30  | 3.5 Mbps |
| `720p60`  | 1280 × 720 | 60  | 5 Mbps |
| `1080p`   | 1920 × 1080| 30  | 6 Mbps |
| `1080p60` | 1920 × 1080| 60  | 8 Mbps |

Two settings live in `useVoiceStore`: `videoQuality` (outbound, persisted via localStorage) and `receivedVideoQuality` (the cap we ask peers to send to us via the `qualityhint` signal). The `Settings` panel in `VoiceControls.tsx` exposes both.

**Codec preference** — `peer.ts` calls `setCodecPreferences` on every newly-added video transceiver to bias the offer SDP toward `VP9 → H.264 → VP8` (with AV1, RTX, etc. kept at the bottom of the list for negotiation completeness). VP9 ships ~30–40% better quality than VP8 at the same bitrate; H.264 is the universal fallback for Safari/iOS; VP8 is the WebRTC default if neither negotiates. Falls through silently when `RTCRtpSender.getCapabilities` is missing (older Safari, headless tests).

**Encoder hints**:
- Camera tracks: `track.contentHint = 'motion'` and the sender's `degradationPreference = 'maintain-framerate'` — under congestion the browser scales resolution down rather than dropping frames, since face/gesture motion is what users notice.
- Screen-share tracks: `track.contentHint = 'detail'` and `degradationPreference = 'maintain-resolution'` — text needs sharp pixels, drop framerate before scaling.
- Screen-audio tracks: `track.contentHint = 'music'` so Opus encodes at full 256 kbps without applying voice-style AGC.

**Audio**: `AUDIO_MAX_BITRATE = 256 kbps` (bumped from 128 kbps), applied via `setParameters` on the audio sender once the PC reaches `'connected'`. Opus tops out around 256 kbps for stereo material; the extra bandwidth is negligible vs the video budget and keeps voice crisp through incidental music or background detail.

## Speaking detection

`SpeakingDetector` polls the AnalyserNode at 20 Hz, computes RMS over the time-domain buffer, and flips a `speaking` boolean when RMS crosses 0.02 with a 400 ms hangover. The local mic gets one detector keyed by `selfPubkey`; each remote audio track gets a detector keyed by the peer's pubkey. State flows into `useVoiceStore.speakingPubkeys` and the UI tile pulses a green ring when its pubkey is present.

## Perfect negotiation

Polite/impolite is decided per peer pair: `polite = self.pubkey > remote.pubkey`. The polite side rolls back on offer glare; the impolite side ignores conflicting remote offers. Sequence numbers on the signaling payload let receivers drop out-of-order ICE without affecting offer/answer flow. Implementation: `Peer.handleSignal` in `peer.ts`.

## Reconnect ladder

Every `Peer` arms a 15 s **initial-handshake watchdog** at construction. If the PC never reaches `'connected'` within that window, the impolite side performs a hard reset; the polite side emits `requestReset` so the impolite peer drives the rebuild without offer glare.

Once connected, transitions to `'failed'` or `'disconnected'` schedule recovery on a per-peer back-off:

```
Impolite: ICE restart at 1.5s, 3s, 6s (up to ICE_RESTART_LIMIT=3),
          then hard reset (close + new PC + re-attach all senders) at 10s, 15s.
Polite:   requestReset at 8s, 12s, 20s (waits longer; never recreates own PC).
```

`requestReset` flips `Peer.handleSignal` to a hard-reset path on the impolite side. `wasConnected` edges drive `onConnectionEstablished` / `onConnectionLost` callbacks the `VoiceClient` uses to keep the beacon's `connectedTo` list in sync.

## Beacon redundancy (transitive discovery + video-slot announcement)

`VoiceClient` keeps two pieces of state synced into every beacon (kind 20078):

- **`connectedPubkeys: Set<string>`** — peers we have a live `'connected'` `RTCPeerConnection` to. Drives `p` tags so other clients can discover them transitively when their relay drops the publisher's own beacon.
- **`localVideoClaimedAt: Map<'camera'|'screen', number>`** — the local outbound video tracks. Drives `v` tags so every other client can compute the room-wide video count for `MAX_VIDEO_SLOTS` enforcement.

```
{
  kind: 20078,
  content: '',
  tags: [
    ['e', channelId],
    ['t', 'obelisk-voice-presence'],
    ['expiration', String(now + 30)],
    ['p', connectedPeerA],
    ['p', connectedPeerB],
    ['v', 'camera'],   // optional — only if publisher is sending camera
    ['v', 'screen'],   // optional — only if publisher is sharing screen
  ]
}
```

The roster handler in `transport.ts` parses both `p` tags (transitive discovery) and `v` tags (video-slot accounting). `VoiceClient.handleRoster` membership-filters and dials anyone in the union it isn't already connected to. `VoiceClient.enforceVideoSlotCap` builds the flattened video-track list `[(pubkey, kind, claimedAt)]`, sorts by `(claimedAt asc, pubkey asc)`, and locally evicts any of OUR tracks that fell outside the leading-`MAX_VIDEO_SLOTS` slice.

Result: even if relay X drops every beacon E publishes, every other client that received A's beacon — when A had connected to E — knows E is in the room and dials E directly. Mesh formation converges from any starting position with asymmetric beacon delivery.

To minimize latency, beacons are republished **opportunistically** (debounced 250 ms) on every connection-state change OR local video toggle, so a successful connection / new video claim propagates within the next beacon hop, not after a full 15 s tick.

## What's not yet shipped

These are tracked in [webrtc-p2p-nostr-signaling.md](webrtc-p2p-nostr-signaling.md) §1 and `docs/known-bugs.md`:

- **Moderator force actions.** Receiver-side admin check exists; sender side (mute / camera-off / screen-off / kick from the UI) is not wired.
- **Capacity beyond 6.** Hard cap; no SFU fallback. Above 6 participants the lexicographically-greatest pubkeys are evicted client-side.
- **TURN by default.** Public STUN only; configure TURN via `NEXT_PUBLIC_TURN_URLS` if needed.
- **Encrypted signaling.** Plaintext ephemeral events; gift-wrap upgrade planned.

## Reaching a voice channel

Today the entry point is the URL `/voice/<groupId>`, plus deeplinks from chat-channel surfaces that detect `JsGroup.kind === 'voice'`. A dedicated "Voice channels" section in the sidebar with a Join button is follow-up work.

## Testing

- `src/lib/voice/peer.test.ts` — perfect-negotiation glare, ICE batching, track-info routing.
- `src/lib/voice/peer-pair.integration.test.ts` — end-to-end two-peer offer/answer over a fake transport.
- `src/lib/voice/peer-reconnect.test.ts` — initial-handshake watchdog, ICE-restart-then-hard-reset escalation, polite `requestReset`, hard-reset re-attaches local senders, `onConnectionEstablished` / `onConnectionLost` edges.
- `src/lib/voice/client.test.ts` — roster/membership filtering, leave teardown, deafen state, capacity (6).
- `src/lib/voice/transport.test.ts` — beacon expiration parsing, drop-non-member.
- `src/lib/voice/transport-transitive.test.ts` — beacons emit `p` tags for connected peers, roster captures `connectedTo`, `transitiveParticipants` survives missing publisher beacons.
- `src/lib/voice/multi-client.integration.test.ts` — node-syncing at the relay level: real `nostr-tools` keypairs (`generateSecretKey`, `getPublicKey`), in-process FakeRelay routing kind 20078 + 25050 between multiple `VoiceClient` instances; covers two-client mesh formation, transitive discovery survives a dropped publisher beacon, per-peer mute, leave + rejoin.
- `src/lib/voice/speaking-detector.test.ts` — RMS threshold, hangover, idempotent stop, no flicker on within-hangover silence.
- `src/lib/voice/quality.test.ts` / `stats.test.ts` — encoder presets and stats polling.
- `src/components/voice/fullscreen.test.ts` — `toggleFullscreen` enter/exit, `useFullscreenState` event subscription, webkit-prefix fallback.

A two-device manual matrix is in [webrtc-p2p-nostr-signaling.md §7](webrtc-p2p-nostr-signaling.md).
