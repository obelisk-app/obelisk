# Voice System — Architecture, Limitations & Upgrade Path

## Current Architecture: WebSocket Media Relay

Voice, video, and screen sharing in Obelisk are all sent over the existing Socket.io connection instead of using WebRTC. This was chosen because the production deployment runs behind a **Cloudflare Tunnel**, which only forwards HTTP/HTTPS/WebSocket traffic — not the raw UDP packets that WebRTC requires.

### How audio works

```
Mic → getUserMedia() → ScriptProcessorNode → Float32 PCM frames
  → socket.emit('voice-audio', buffer)
  → Server broadcasts to all other sockets in voice:channelId room
  → socket.on('voice-audio') → Ring buffer AudioBufferSourceNode → Speakers
```

1. **Capture**: Browser captures microphone via `getUserMedia()` with echo cancellation, noise suppression, and auto gain control.
2. **Encode**: A `ScriptProcessorNode` captures PCM Float32 frames (960 samples = 20ms at 48kHz).
3. **Send**: Raw PCM data is sent via Socket.io `voice-audio` event as an `ArrayBuffer`.
4. **Relay**: Server broadcasts to all other sockets in the same `voice:channelId` room.
5. **Playback**: Each client writes incoming PCM frames into a looping `AudioBuffer` ring buffer connected to speakers via a `GainNode`.

### How video / screen sharing works

```
Camera/Screen → getDisplayMedia() / getUserMedia({video}) → MediaRecorder (VP8 webm, 500kbps)
  → ondataavailable (every 200ms) → socket.emit('voice-video' | 'voice-screen', chunk)
  → Server broadcasts to all other sockets in voice:channelId room
  → socket.on('voice-video' | 'voice-screen') → MediaSource + SourceBuffer → <video> element
```

1. **Capture**: Browser captures camera via `getUserMedia({video})` or screen via `getDisplayMedia()`.
2. **Encode**: `MediaRecorder` encodes VP8 webm at 500 kbps, emitting chunks every 200ms.
3. **Send**: Encoded webm chunks sent via Socket.io as `ArrayBuffer`.
4. **Relay**: Server broadcasts to all other sockets in the voice room.
5. **Playback**: Each client creates a `<video>` element with `MediaSource` API, feeding chunks into a `SourceBuffer` for playback.
6. **Signaling**: `voice-video-start/stop` and `voice-screen-start/stop` events notify peers when streams start/end.

### Files

| File | Purpose |
|------|---------|
| `src/lib/voice.ts` | `WebSocketVoiceClient` class — audio/video/screen capture, send/receive, playback |
| `server.ts` | Media relay events — broadcasts audio/video/screen to voice room |
| `src/store/voice.ts` | Zustand store — channel, participants, mute/deafen, camera/screen state |
| `src/components/chat/VoiceChannel.tsx` | Voice channel UI — participant grid, join button |
| `src/components/chat/VoiceControls.tsx` | Mute/deafen/camera/screen/disconnect controls |
| `src/app/chat/page.tsx` | Wires `WebSocketVoiceClient` to UI handlers |
| `src/app/api/channels/[channelId]/voice/route.ts` | REST endpoint for fetching current voice participants |
| `prisma/schema.prisma` | `VoiceState` model — tracks who is in which voice channel |

---

## Current Limitations

### Audio quality & latency

| Metric | WebSocket (current) | WebRTC (future) |
|--------|---------------------|-----------------|
| Latency | ~200-400ms | ~50-100ms |
| Audio codec | Raw PCM (uncompressed) | Opus (compressed) |
| Audio bandwidth / user | ~768 kbps | ~32-64 kbps |
| Echo cancellation | Browser-side only | Browser + network-level |
| Jitter handling | Ring buffer (basic) | WebRTC jitter buffer (advanced) |

### Video quality & latency

| Metric | WebSocket (current) | WebRTC (future) |
|--------|---------------------|-----------------|
| Latency | ~1-3s | ~100-300ms |
| Video codec | VP8 via MediaRecorder | VP8/VP9/H.264 via WebRTC |
| Video bandwidth | ~500 kbps fixed | Adaptive bitrate |
| Resolution | 640x480 @ 15fps | Up to 1080p adaptive |
| Keyframe control | MediaRecorder decides | On-demand via SFU |
| Simulcast | Not available | Available via mediasoup |

### Bandwidth concerns

**Audio**: Raw Float32 PCM at 48kHz is ~768 kbps per stream. With 5 participants, the server relays ~3.8 Mbps.

**Video**: VP8 at 500 kbps per stream. With 3 video streams + 1 screen share, the server relays ~2 Mbps. This is manageable for small groups but doesn't scale.

**Screen share**: Same as video. Screen content compresses better (less motion) so effective bandwidth is usually lower.

### Known issues with WebSocket video

- **Latency accumulation**: MediaSource buffers can grow, causing playback to fall behind. No mechanism to skip ahead to live.
- **No keyframe requests**: If a chunk is lost or a client joins mid-stream, they must wait for the next keyframe (MediaRecorder emits them periodically).
- **Browser compatibility**: MediaSource + VP8 works in Chrome/Edge/Firefox. Safari support is limited.
- **No adaptive bitrate**: Fixed 500 kbps regardless of network conditions. Poor connections will see buffering.

### ScriptProcessorNode deprecation

`ScriptProcessorNode` is deprecated in favor of `AudioWorklet`. It still works in all browsers but runs on the main thread. Migration to AudioWorklet would:
- Move audio processing off the main thread
- Reduce audio glitches during UI interactions
- Require serving a separate worklet JS file

---

## Upgrade Path

### Option 1: P2P WebRTC with free STUN (no server changes)

Use peer-to-peer WebRTC for all media. No SFU needed for small groups.

- Use free STUN servers (Google: `stun:stun.l.google.com:19302`)
- Exchange SDP offers/answers and ICE candidates over existing Socket.io
- Works for most users on home/mobile networks
- Fails behind strict corporate firewalls (no TURN fallback)
- Best for: 2-4 person calls

### Option 2: TURN relay service (recommended for reliability)

Use a TURN server to relay WebRTC media through TCP/443.

**Free/cheap TURN providers:**
- **Metered.ca** — free tier with 500GB/mo relay bandwidth
- **Xirsys** — free tier available
- **Cloudflare Calls** — if already using Cloudflare (paid)

### Option 3: mediasoup SFU (best quality, most complex)

Add `mediasoup` directly to server.ts as an SFU. The mediasoup implementation was already built and tested (see git history) — it was replaced with WebSocket relay because of the tunnel constraint.

**Requirements:**
- Expose UDP ports 40000-40100 on the server
- Set `MEDIASOUP_ANNOUNCED_IP` to the server's public IP
- OR use TURN to tunnel media through TCP

### Option 4: Improve current WebSocket approach

If staying with WebSocket relay:
1. **Opus compression** — reduce audio bandwidth from ~768 kbps to ~32 kbps using a WASM Opus encoder
2. **AudioWorklet** — move audio processing off the main thread
3. **Silence detection (VAD)** — stop sending frames when the user isn't speaking
4. **Video latency management** — periodically seek the MediaSource to live edge
5. **Adaptive video quality** — reduce bitrate/resolution when bandwidth is constrained

---

## Data Model

```prisma
model VoiceState {
  id        String   @id @default(cuid())
  channelId String
  pubkey    String
  muted     Boolean  @default(false)
  deafened  Boolean  @default(false)
  joinedAt  DateTime @default(now())

  channel Channel @relation(fields: [channelId], references: [id], onDelete: Cascade)

  @@unique([channelId, pubkey])
  @@index([channelId])
}
```

Voice state is persisted in the database so the API endpoint (`GET /api/channels/:channelId/voice`) can return current participants even without Socket.io. States are cleaned up on disconnect.

## Socket.io Events

### Audio
| Event | Direction | Payload | Purpose |
|-------|-----------|---------|---------|
| `voice-audio` | C → S | `ArrayBuffer` (Float32 PCM) | Send audio frame |
| `voice-audio` | S → C | `{ pubkey, data }` | Receive audio from another participant |

### Video (Camera)
| Event | Direction | Payload | Purpose |
|-------|-----------|---------|---------|
| `voice-video` | C → S | `ArrayBuffer` (webm chunk) | Send video chunk |
| `voice-video` | S → C | `{ pubkey, data }` | Receive video from another participant |
| `voice-video-start` | C → S / S → C | `{ pubkey }` | Camera started |
| `voice-video-stop` | C → S / S → C | `{ pubkey }` | Camera stopped |

### Screen Share
| Event | Direction | Payload | Purpose |
|-------|-----------|---------|---------|
| `voice-screen` | C → S | `ArrayBuffer` (webm chunk) | Send screen chunk |
| `voice-screen` | S → C | `{ pubkey, data }` | Receive screen from another participant |
| `voice-screen-start` | C → S / S → C | `{ pubkey }` | Screen share started |
| `voice-screen-stop` | C → S / S → C | `{ pubkey }` | Screen share stopped |

### Voice State
| Event | Direction | Payload | Purpose |
|-------|-----------|---------|---------|
| `join-voice` | C → S | `channelId: string` | Join voice channel, create VoiceState |
| `leave-voice` | C → S | `channelId: string` | Leave voice channel, delete VoiceState |
| `voice-mute` | C → S | `{ channelId, muted }` | Toggle mute |
| `voice-deafen` | C → S | `{ channelId, deafened }` | Toggle deafen |
| `voice-state-update` | S → C | `{ channelId, participants[] }` | Participant list changed |

## Zustand Store State

```typescript
interface VoiceState {
  currentVoiceChannelId: string | null;
  voiceParticipants: VoiceParticipant[];
  isMuted: boolean;
  isDeafened: boolean;
  isConnecting: boolean;
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'failed';
  error: string | null;
  isCameraOn: boolean;
  isScreenSharing: boolean;
  remoteVideos: Set<string>;   // pubkeys with camera on
  remoteScreens: Set<string>;  // pubkeys sharing screen
}
```
