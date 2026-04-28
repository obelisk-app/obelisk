# Voice System

Two backends, selected per channel by the admin via `Channel.voiceMode`:

- **`mesh`** (default) — P2P WebRTC mesh. The server relays **signaling only** (SDP, ICE, track-type hints). Media never transits the server. Great for ≤8 participants, zero bandwidth cost on the host.
- **`sfu`** — LiveKit SFU. Each publisher sends one stream up, the server fans it out. Required for 50-person community calls with cameras + screen share. Media does transit the self-hosted LiveKit container.

## Architecture

```
mesh channel                         sfu channel
─────────────                        ───────────
Browser ──RTC──▶ Browser             Browser ──WebRTC──▶ LiveKit server
   ▲                │                   ▲                     │
   └─ Socket.io ────┘                   └─ token via Next ─────┘
   relay only                          media transits SFU
```

Each participant in mesh opens one `RTCPeerConnection` per remote peer; uplink scales as O(N−1), which caps mesh around 8 publishers. SFU keeps publisher uplink flat regardless of room size.

## Files

- `src/lib/voice.ts` — `WebSocketVoiceClient` class for **mesh** channels. Peer management, track routing, quality tuning, reconnection.
- `src/lib/livekit-voice.ts` — `LiveKitVoiceClient` for **sfu** channels. Same public surface as the mesh client; LiveKit handles speaking detection, reconnect, simulcast, and track lifecycle natively.
- `src/app/api/voice/token/route.ts` — mints LiveKit access tokens. Enforces channel read permission (stricter than the historical mesh `join-voice` path). Returns 503 when `LIVEKIT_URL` is unset.
- `src/lib/speaking-detector.ts` — `SpeakingDetector` + shared `AudioContext`. Used on the mesh path only; SFU emits `ActiveSpeakersChanged` directly.
- `src/store/voice.ts` — Zustand store. Holds participants, `speakingPubkeys`, `localMutedPubkeys`, remote video/screen element refs, focus state.
- `src/components/chat/VoiceChannel.tsx` — voice UI: video grid, audio-only tiles, screen share area, companion chat rail.
- `src/components/chat/VoiceControls.tsx` — the bottom control bar (mute, deafen, camera, screen share, settings, leave).
- `server.ts` — Socket.io relay for `join-voice`, `leave-voice`, `voice-signal`, capacity claims, and moderator force actions.

## Perfect negotiation

On connection, each peer computes `polite = (my socketId > remote socketId)`. The polite side rolls back on offer glare; the impolite side holds ground. Implementation in `handleSignal` follows [the MDN perfect-negotiation pattern](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation_pattern).

## Track types

Tracks are announced out-of-band before `ontrack` fires so the remote side knows which slot each is for:

| Type           | Source                                    | Transceiver semantics                           |
|----------------|-------------------------------------------|-------------------------------------------------|
| `audio`        | `getUserMedia({ audio })` — the mic       | Drives the speaking detector + user gain node    |
| `camera`       | `getUserMedia({ video })` — webcam        | `maintain-resolution` degradation preference     |
| `screen`       | `getDisplayMedia({ video })`              | `maintain-resolution` + `minBitrate` floor       |
| `screen-audio` | `getDisplayMedia({ audio })` — tab audio  | Tuned to 320 kbps (music-grade) separately       |

`sendTrackInfo` emits `{ trackInfo: { trackId, type } }` on the signaling channel. Track-id mismatch is handled by draining pending tracks by `kind` in `findUnattachedTrackType`.

## Remote audio routing

Every remote audio track (mic or screen-audio) connects to a per-peer `GainNode` in a shared `AudioContext`:

```
MediaStreamAudioSourceNode (new MediaStream([track]))
   └─▶ GainNode (per peer, per kind)
         └─▶ AudioContext.destination
```

Why not `<audio>` elements? Browser autoplay policy fires per-element. When the mic track's `<audio>` element was already playing, a second `<audio>` for `screen-audio` would silently hit the policy and stay muted — that was the "screen audio silent when mic is on" bug. Using one AudioContext means one unlock (the Join Voice click calls `resumeSharedAudioContext()`) covers every remote source for the session.

Gain also gives us two features cheaply:

- **Deafen** — iterate peers, set every gain to 0.
- **Local per-user mute** — viewer-only silence of a specific peer via `toggleLocalMute(pubkey)` in the store; client calls `setPeerMuted(pk, muted)` which flips that peer's gain.

Neither sends any server traffic.

## Speaking detection

`SpeakingDetector` attaches an `AnalyserNode` (`fftSize: 512`) to the incoming stream, samples `getByteTimeDomainData` at 20 Hz, and computes normalized RMS. A peer is reported "speaking" when RMS crosses `threshold` (default 0.02), and stays speaking for `hangoverMs` (default 400) after silence — this absorbs normal speech pauses so the UI orb doesn't strobe.

One detector per peer for `audio` tracks only (not `screen-audio`). The client also runs a detector on the local mic so the viewer's own orb reacts to their voice without round-tripping through a remote. Each transition is pushed to the store via `onSpeakingChange → setSpeaking(pubkey, speaking)`.

## Reconnection

`RTCPeerConnection` doesn't heal itself; we drive recovery explicitly. Two independent mechanisms:

1. **Connection-state recovery.** On `'disconnected'` or `'failed'`, `scheduleReconnect` runs:
   - **Impolite side** — ICE restart (preserves tracks, cheap) up to 3 attempts, then a hard reset (close + recreate + re-offer). Delays: `[1.5, 3, 6, 10, 15]` s.
   - **Polite side** — used to be passive, which stranded it in `'failed'` forever. Now, after a longer grace (`[8, 12, 20]` s), it emits `{ requestReset: true }`. The impolite side handles that in `handleSignal` by running a hard reset — this avoids glare because only one side ever drives the recreate.

2. **Initial-handshake watchdog.** `scheduleReconnect` never fires during the first handshake because `connectionState` sits in `'new'`/`'connecting'`, neither `'failed'` nor `'disconnected'`. Without a dedicated timer, a lost first offer would wedge the session and only leave/rejoin would recover it. A 15 s `connectWatchdogTimer` catches that gap: impolite side hard-resets, polite side emits `requestReset`. Cleared on the first transition to `'connected'`.

## Quality tuning

User-tunable defaults live in `getVoiceQuality()` / `setVoiceQuality()` (backed by `localStorage`). Encoder parameters are applied via `tuneVideoSender` / `tuneAudioSender`:

- Camera: `maintain-resolution`, `maxBitrate 8 Mbps`, `minBitrate 2 Mbps`, `priority: 'high'`.
- Screen: `maintain-resolution`, `maxBitrate 25 Mbps`, `minBitrate 5 Mbps`, `priority: 'high'`, framerate hint per settings.
- Mic audio: Opus `maxBitrate 256 kbps`, `priority: 'high'`, `networkPriority: 'high'`. `enhanceOpusSdp` also merges `maxaveragebitrate=256000` + `useinbandfec` into the SDP fmtp line without touching stereo/DTX (Safari drops the whole audio m-section otherwise).
- Screen-audio: 320 kbps — high enough that shared music/video soundtracks don't sound strangled.

`minBitrate` is advisory; browsers may still downshift under real congestion, but it prevents the bandwidth estimator from starving video when nothing's wrong.

## Companion text chat

Voice channels are just `Channel` rows with `type: 'voice'`. The text-messages API and `new-message` Socket.io broadcast already accept messages for them with no extra work. `VoiceChannel.tsx` accepts an optional `chatSlot` prop; the chat page passes in the same `<MessageArea/>` + `<MessageInput/>` pipeline text channels use. A right-rail renders the slot with a toggle, so users can reclaim space on small viewports.

## Moderator force actions

Owners / admins / mods can force-mute, force-camera-off, and force-screen-off another participant via `voice-mod-action` on the server. The target receives `voice-force-mute` / `voice-force-camera-off` / `voice-force-screen-off` and the client stops the corresponding local track. This is separate from local per-user mute, which never leaves the viewer's browser.

## Capacity limits

Server enforces per-channel capacity locks:

- Camera: 4 simultaneous broadcasters (`voice-camera-claim` / `voice-camera-release`).
- Screen share: 2 simultaneous (`voice-screen-claim` / `voice-screen-release`).

Exceeding capacity rejects the claim with an error the client surfaces via `limitNotice`.

## Testing

- `src/lib/speaking-detector.test.ts` — mocked `AudioContext` + `AnalyserNode`, deterministic `now()`. Verifies threshold, hangover, idempotency, flicker suppression.
- `src/store/voice.test.ts` — speaking set idempotence, local-mute toggle, leaveVoice clears both sets, removeParticipant preserves local-mute preference.
- `src/components/chat/VoiceChannel.test.tsx` — orb reflects `speakingPubkeys`, orb is suppressed while muted, local-mute toggle wiring, chat rail mount/hide.

No unit tests hit `src/lib/voice.ts` directly (no `RTCPeerConnection` mock in the repo). Behavior there is verified by the manual steps in the plan file and in-browser validation.
