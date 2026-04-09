# Voice System — mediasoup WebRTC SFU

## Architecture

Voice and video in Obelisk use **mediasoup**, a WebRTC SFU (Selective Forwarding Unit). Each voice channel gets a mediasoup Router. Each connected user gets send/receive WebRTC transports with Producers (sending media) and Consumers (receiving media).

```
Browser A (mic/camera)
  → WebRTC Transport (DTLS/SRTP over UDP)
    → mediasoup Worker (native C++ process)
      → Router (codec negotiation, RTP routing)
        → WebRTC Transport → Browser B (speakers/display)
        → WebRTC Transport → Browser C (speakers/display)
```

Media flows over UDP ports 40000-40100 using standard WebRTC (DTLS-SRTP). Signaling happens over the existing Socket.io connection.

## Key Components

### Server-side

| File | Purpose |
|------|---------|
| `server.ts` | Spawns mediasoup Worker, handles Socket.io signaling events |
| `src/lib/mediasoup-config.ts` | Worker settings (ports), Router options (codecs), Transport options |
| `src/lib/mediasoup-room.ts` | `MediasoupRoom` (per channel) and `MediasoupPeer` (per user) classes |

### Client-side

| File | Purpose |
|------|---------|
| `src/lib/voice.ts` | mediasoup-client device, transport creation, produce/consume logic |
| `src/store/voice.ts` | Zustand store — channel, participants, mute/deafen, camera/screen state |
| `src/components/chat/VoiceChannel.tsx` | Voice channel UI — participant grid, join button |
| `src/components/chat/VoiceControls.tsx` | Mute/deafen/camera/screen/disconnect controls |

### Data Model

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

## How It Works

### Connection Flow

1. **Client joins voice channel** → sends `join-voice` via Socket.io
2. **Server creates Room** (if first peer) → Router with Opus + VP8 codecs
3. **Server returns `rtpCapabilities`** → client loads them into mediasoup-client Device
4. **Client creates send transport** → `ms:create-transport` → server creates WebRtcTransport, returns `{ id, iceParameters, iceCandidates, dtlsParameters }`
5. **Client creates recv transport** → same as above
6. **Client connects transports** → `ms:connect-transport` with DTLS parameters
7. **Client produces audio** → `ms:produce` → server creates Producer, notifies other peers via `ms:new-producer`
8. **Other peers consume** → `ms:consume` → server creates Consumer for each peer, returns RTP parameters
9. **Client resumes consumer** → `ms:resume-consumer` → media starts flowing

### Leaving

1. **Client sends `leave-voice`** → server closes all transports/producers/consumers for that peer
2. **Server removes peer from Room** → if room is empty, Router is closed and room is removed
3. **VoiceState** is deleted from the database

### mediasoup Configuration

- **Worker**: Single C++ worker process, ports 40000-40100 (UDP)
- **Router codecs**: Opus (audio, 48kHz stereo) + VP8 (video)
- **Transport**: WebRTC with both UDP and TCP listen, `initialAvailableOutgoingBitrate: 1Mbps`
- **Announced IP**: Set via `MEDIASOUP_ANNOUNCED_IP` env var (required for production — must be the server's public IPv4)

## Socket.io Signaling Events

### mediasoup Transport/Media

| Event | Direction | Payload | Purpose |
|-------|-----------|---------|---------|
| `ms:create-transport` | C → S | `{ direction }` | Create send or recv WebRTC transport |
| `ms:create-transport` | S → C | `{ id, iceParameters, iceCandidates, dtlsParameters }` | Transport parameters for client |
| `ms:connect-transport` | C → S | `{ transportId, dtlsParameters }` | Complete DTLS handshake |
| `ms:produce` | C → S | `{ transportId, kind, rtpParameters, appData }` | Start producing media |
| `ms:produce` | S → C | `{ producerId }` | Producer created |
| `ms:consume` | C → S | `{ producerId, rtpCapabilities }` | Request to consume a producer |
| `ms:consume` | S → C | `{ consumerId, producerId, kind, rtpParameters }` | Consumer parameters |
| `ms:resume-consumer` | C → S | `{ consumerId }` | Resume paused consumer |
| `ms:new-producer` | S → C | `{ producerId, pubkey, kind, appData }` | Notify peers of new producer |
| `ms:producer-closed` | S → C | `{ producerId }` | Notify peers producer was closed |

### Voice State

| Event | Direction | Payload | Purpose |
|-------|-----------|---------|---------|
| `join-voice` | C → S | `channelId` | Join voice channel, create VoiceState |
| `leave-voice` | C → S | `channelId` | Leave voice channel, delete VoiceState |
| `voice-mute` | C → S | `{ channelId, muted }` | Toggle mute |
| `voice-deafen` | C → S | `{ channelId, deafened }` | Toggle deafen |
| `voice-state-update` | S → C | `{ channelId, participants[] }` | Participant list changed |

## Deployment Requirements

- **UDP ports 40000-40100** must be open and reachable from the internet
- **`PUBLIC_IP`** env var must be set to the server's public IPv4 address
- **Cloudflare Tunnel users**: The tunnel only forwards HTTP/WebSocket traffic. WebRTC media bypasses the tunnel and flows directly over UDP to the server IP. This is expected and correct — signaling goes through the tunnel, media goes direct.

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
  remoteVideos: Set<string>;
  remoteScreens: Set<string>;
  isSpeaking: boolean;
}
```
