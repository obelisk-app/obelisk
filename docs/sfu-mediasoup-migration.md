# SFU — werift → mediasoup migration

**Status:** in progress.
**Why:** see [sfu-system.md §10](sfu-system.md). werift renegotiation is buggy at scale (m-line ordering, BUNDLE MID empty, codec PT remapping, glare deadlocks); mediasoup solves all of these and adds simulcast + bandwidth estimation. Single-threaded JS forwarding caps werift at ≤10 receivers; mediasoup uses a C++ worker per CPU core.

## High-level architecture

```
┌────────────┐   kind 25050        ┌─────────────────┐   mediasoup    ┌──────────┐
│  Browser   │  request/response  │  Nostr-bridge    │   protocol    │ mediasoup │
│ (mediasoup-│ ─────────────────► │  (Node, in-proc) │ ────────────► │  Worker   │
│  client)   │ ◄───────────────── │                  │ ◄──────────── │  (C++)    │
└────────────┘   kind 25050        └─────────────────┘                └──────────┘
                                              ▲
                                              │ kind 25052 (start/end/etc)
                                              ▼
                                    ┌──────────────────┐
                                    │   Nostr relay    │
                                    └──────────────────┘
```

The browser never speaks HTTP/WebSocket directly to the SFU — every call lands on a Nostr relay. The bridge is a thin RPC layer that translates Nostr-event payloads to mediasoup `Router`/`Transport`/`Producer`/`Consumer` calls and back.

## Wire protocol over kind 25050

Every body is JSON. A `request` carries a `requestId`; the matching `response` echoes it. `notification` carries no id (server-pushed events).

```json
// kind 25050 content (after NIP-44 if encrypted) — example request
{
  "type": "request",
  "requestId": "abc123",
  "method": "getRouterRtpCapabilities",
  "data": {}
}

// response
{
  "type": "response",
  "requestId": "abc123",
  "ok": true,
  "data": { "codecs": [...], "headerExtensions": [...] }
}

// notification (server → client, no id)
{
  "type": "notification",
  "method": "newConsumer",
  "data": { "producerId": "...", "id": "...", "kind": "video", "rtpParameters": {...}, "appData": { "originPubkey": "..." } }
}
```

### Methods (server-handled requests)

| method | purpose |
|---|---|
| `getRouterRtpCapabilities` | client calls before creating a Device |
| `createWebRtcTransport`    | server allocates a transport, returns `id`, `iceParameters`, `iceCandidates`, `dtlsParameters`. One transport per direction per browser |
| `connectWebRtcTransport`   | client sends back its DTLS `dtlsParameters` |
| `produce`                  | client says "I'm starting to send a track"; data carries `kind`, `rtpParameters`, `appData` (origin pubkey, voice-kind) |
| `consume`                  | (rare, usually pushed) client requests a specific producer's stream |
| `restartIce`               | request fresh ICE candidates after network change |

### Notifications (server-pushed)

| method | purpose |
|---|---|
| `newProducer`   | a peer in the room started a new track — client decides whether to consume |
| `producerClosed`| stop the consumer for that producer |
| `newConsumer`   | server set up a consumer for the client; client `consumer.resume()` after rendering |
| `roomClosed`    | the room was torn down (host left, idle, etc.) |

### Why a custom protocol instead of mediasoup-server's built-in signaling

mediasoup ships *no* signaling — it's protocol-agnostic by design. Every mediasoup deployment writes its own thin RPC layer (the `mediasoup-demo` repo uses `protoo`, our flavor is "Nostr-events as transport"). All we do is map our request/response/notification envelope to mediasoup-client's expected message shape on the browser side.

## Server topology (Node.js, in-process)

```
NostrSignalingBridge
├── on Nostr kind 25050 → routes by method to RoomController
└── publishes responses + notifications back as kind 25050

mediasoup.Worker × N (one per CPU core)
└── Router(s) — one per channel/room
    └── per-peer Transports (recv + send)
        ├── Producers (track ingressed from browser)
        └── Consumers (track being forwarded to browser)
```

One mediasoup `Router` = one channel/room. The Router decides which producers each consumer can subscribe to (we treat all in-room producers as auto-consumable; Layer-3/4 ACLs from `auth.ts` still apply).

## Client topology

```ts
import { Device } from 'mediasoup-client';

const device = new Device();
const caps = await rpc('getRouterRtpCapabilities');
await device.load({ routerRtpCapabilities: caps });

// Create send transport
const sendInfo = await rpc('createWebRtcTransport', { direction: 'send' });
const sendTransport = device.createSendTransport(sendInfo);
sendTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
  rpc('connectWebRtcTransport', { transportId: sendInfo.id, dtlsParameters })
    .then(callback).catch(errback);
});
sendTransport.on('produce', ({ kind, rtpParameters, appData }, callback, errback) => {
  rpc('produce', { transportId: sendInfo.id, kind, rtpParameters, appData })
    .then(({ id }) => callback({ id })).catch(errback);
});

// Publish microphone:
const micProducer = await sendTransport.produce({ track: micTrack, appData: { kind: 'audio' } });
```

Receiving works mirrored via a recv transport + `consume` notifications.

## Migration plan (concrete steps)

### Phase 1 — server scaffolding (this PR)
- [x] `npm install mediasoup`
- [ ] `services/sfu/src/mediasoup-server.ts` — boot N workers, expose `getRouter(channelId)` lazily
- [ ] `services/sfu/src/nostr-rpc.ts` — request/response over kind 25050; matches by `requestId`
- [ ] `services/sfu/src/room-mediasoup.ts` — Room replacement: holds the Router, transports, producers, consumers; reuses existing `auth.ts` and `call-listener.ts` for kind 25052 lifecycle
- [ ] Behind `SFU_ENGINE=mediasoup` env flag — werift code stays running until parity is reached

### Phase 2 — client integration
- [ ] `npm install mediasoup-client` (in dex)
- [ ] `src/lib/voice/sfu-client.ts` — encapsulates Device + send/recv transports, exposes the same surface VoiceClient already uses (publish track, on remote track)
- [ ] VoiceClient picks `SfuClient` vs the existing mesh `Peer` based on topology
- [ ] Strip the SFU-specific paths in `peer.ts` (recvonly transceivers, custom kickInitialOffer, etc.) — those exist only to babysit werift

### Phase 3 — production polish
- [ ] Simulcast: client publishes 3 quality layers; server forwards based on receiver's `consumer.setPreferredLayers()` — driven by user's "received video quality" setting
- [ ] Bandwidth estimation: mediasoup exposes `producer.getStats()` + `transport.getStats()` — wire to the existing `useVoiceStore.peerQuality` map
- [ ] Recording / live re-stream (free with mediasoup): future work

### Phase 4 — werift removal
- [ ] Delete `services/sfu/src/peer.ts`, `room.ts` (werift versions)
- [ ] Delete `iceUseIpv6` shim, `coturn external-ip remap` workaround, all the renegotiation patches in `dex/src/lib/voice/peer.ts`
- [ ] `npm uninstall werift`

## Open questions

1. **Encryption of kind 25050 payloads.** Today they're signed-but-cleartext (NIP-29 group context). Producer/consumer SDP-equivalents are technically not sensitive (no media key material), but transport DTLS parameters might warrant NIP-44 encryption. Decide before Phase 2.
2. **mediasoup workers vs. routers count.** One Router per channel can host many producers cheaply, but high-traffic rooms benefit from sharding to multiple workers. v1 = one worker per CPU core, one router per channel, no sharding.
3. **TURN.** mediasoup includes its own ICE/DTLS stack and binds directly to a public IP — no coturn needed for the SFU side. The browser may still need TURN if it's behind symmetric NAT; we keep our coturn for that path.

## Related code

- Existing werift SFU: [services/sfu/src/peer.ts](../services/sfu/src/peer.ts), [room.ts](../services/sfu/src/room.ts)
- Existing dex client: [src/lib/voice/peer.ts](../src/lib/voice/peer.ts), [client.ts](../src/lib/voice/client.ts)
- Auth contract (unchanged): [services/sfu/src/auth.ts](../services/sfu/src/auth.ts)
- Call-listener (unchanged): [services/sfu/src/call-listener.ts](../services/sfu/src/call-listener.ts)
