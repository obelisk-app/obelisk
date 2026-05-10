# Mesh — Testing

Two layers:

| Layer | Tool | Where | Run with |
|---|---|---|---|
| Unit + integration | Vitest + jsdom | `src/lib/voice/*.test.ts` | `npm run test` |
| End-to-end | Playwright + real Chromium WebRTC | `scripts/e2e/voice/*.spec.ts` | `npm run test:e2e:voice` |

## Unit / integration (Vitest)

Each `.ts` file in `src/lib/voice/` has a sibling `.test.ts`. Mocks
live in:

- `bridgeFake.impl` — fake `NostrBridge` (look at
  `src/lib/voice/transport.test.ts` for the canonical setup).
- `FakePc` / `FakeDataChannel` in `control-channel.test.ts` — for the
  data-channel layer.
- A real-ish PC pair via `peer-pair.integration.test.ts` exercising
  the SDP exchange end to end with mocked transport.

`npm run test` runs the full ~1000-test suite in <20s. Add new tests
beside the file you're changing.

## End-to-end (Playwright)

```bash
# 1. Build the production bundle (HMR / Fast Refresh would re-mount
#    the VoiceClient mid-test, breaking the harness):
npm run build

# 2. Start the production server on an unused port:
PORT=3001 npx next start &

# 3. Run the voice specs:
OBELISK_E2E_BASE_URL=http://localhost:3001 npm run test:e2e:voice
```

`npm run test:e2e:voice:headed` adds `--headed` for live observation.

The specs run against `wss://public.obelisk.ar` by default (override
with `OBELISK_E2E_RELAY=wss://relay.obelisk.ar`). The two-peer spec
auto-falls-back to `relay.obelisk.ar` if `public.obelisk.ar` doesn't
reach `relay-access=ok` in 30 s.

### Specs

| Spec | What it proves |
|---|---|
| `two-peer-mesh.spec.ts` | Beacon round-trip, signal round-trip, WebRTC `connectionState='connected'`, fast-hangup detection (<15 s) when one peer leaves |
| `three-peer-transitive.spec.ts` | Full mesh on 3 peers (each reports `connected=2`), 2 control channels per peer, heartbeat alive, at least one `transitive.discoveredViaControl > 0`, fast-hangup propagation when one peer leaves |
| `glare.spec.ts` | Two peers join at the exact same await tick → connection still establishes, exactly one control channel per side (no double-create) |

### Why bypass the VoiceRoom UI?

The room's gate requires the channel's NIP-29 metadata (kind 39000)
to land on the relay AND the test pubkey to be in the member list.
For ad-hoc test channels that's chicken-and-egg. The harness drives
`VoiceClient` directly via `window.__obeliskVoiceClient` (a
test-only constructor exposure) with `{ open: true }` to skip the
membership gate. The transport, peer, and control-channel paths
under test are unaffected.

### Synthetic media

Headless Chromium's `--use-fake-device-for-media-stream` can hang on
`getUserMedia` on some platforms. `installFakeMediaStreams` in
`lib-voice.ts` overrides `navigator.mediaDevices.getUserMedia` with
a Web Audio `OscillatorNode` (220 Hz sine, low gain) and a
canvas `captureStream(15)` so every test gets deterministic real
audio + video frames hitting the encoder.

### Adding a new failure-injection spec

Pattern:

1. Spawn the contexts you need (one BrowserContext per peer).
2. `seedSession` with fresh ephemeral nsecs.
3. `installFakeMediaStreams` on each.
4. `pages[i].goto('/voice/<channelId>')`.
5. `waitForRelayOk` + `waitForBridgeReady` on each.
6. `joinMeshChannel(page, channelId, { otherMembers })`.
7. Inject the failure (e.g. drop the relay subscription, kill the
   data channel, throttle a publish — exposed via `__test_voice` for
   white-box access).
8. Assert via `readMetrics(page)` on the post-condition counter.

Keep specs single-purpose — one failure mode per spec, the smallest
peer count that exercises it. Combined-failure scenarios are
expensive to debug when they fail.
