# Mesh Voice Diagnosis — 2026-05-09

Phase 1 of the mesh-channels-are-not-tranquil plan. Drove two real
Chromium browser contexts against a production build of the dex on
`localhost:3001`, signaling through `wss://public.obelisk.ar` (the
relay the user named in the task brief). Each peer used a fresh
ephemeral nsec; both peers constructed `VoiceClient({ open: true })`
directly via the test-only `window.__obeliskVoiceClient` factory and
called `join()`, bypassing the VoiceRoom UI's NIP-29 membership gate
(no kind 39000 metadata exists for an ad-hoc probe channel).

The harness lives at `scripts/e2e/voice/two-peer-mesh.spec.ts`;
helpers at `scripts/e2e/voice/lib-voice.ts`. Run with
`npm run test:e2e:voice`.

## Findings

### H1 — WoT silently drops voice signaling — **FALSE in test, RISK in prod**

Counter `metrics.signalsDropped.wot === 0` on both peers after a full
mesh formed and ran for 30 s. The `wotEngine.isAllowed(from,
KIND_VOICE_SIGNAL)` predicate at `src/lib/voice/client.ts:490` did not
fire in our test conditions because both pubkeys were freshly generated
with empty WoT graphs and `wotEngine.cfg.enabled` defaults to `false`
(see `src/lib/wot/engine.ts:65`).

**Production risk** — when an end user enables WoT and joins a voice
channel with another user who isn't in their follow graph, the predicate
will return `false` and silently drop kind 25050 with no observable
counter prior to this diagnostic. The Phase 2 fix adds `KIND_VOICE_PRESENCE`
and `KIND_VOICE_SIGNAL` to `ALWAYS_ALLOW_KINDS` (membership in the
NIP-29 group is the right trust gate for voice; WoT shouldn't double-gate
inside a small per-channel room).

### H2 — Membership-race silently drops first signal — **FALSE in test, REAL in prod**

Counter `metrics.signalsDropped.membershipFinal === 0` on both peers.
The test wires `members: [pkA, pkB]` directly into the `VoiceClient`
constructor, so `isMember(from)` returned `true` immediately for the
first inbound offer.

**Production risk** — in real usage, members come asynchronously from
kind 39002 events. A peer who publishes their first beacon and SDP
offer before the receiving peer's `subscribeMembers` snapshot lands
gets dropped by the `if (!this.isMember(from)) return;` gate at
`client.ts:489`. The Phase 2 fix replaces the silent `return` with a
5 s deferred-signal queue, drained whenever `updateRoles()` admits a
new member.

### H3 — AUTH-vs-bringup race delays first beacon — **FALSE on `public.obelisk.ar`**

`relay-access → ok` on both peers within **660 ms** of `page.goto()`.
The first beacon publish (via the front-loaded burst at
`BEACON_BRINGUP_DELAYS_MS = [500, 1500, 3500, 7000, 12_000]`) landed
inside the 5 s window where AUTH is reliably complete. We still ship
the explicit `bridge.waitForRelayAuth(5000)` gate from Phase 2 fix C
because slower relays will eventually surface this — `public.obelisk.ar`
is fast enough today that it doesn't, but a regression in relay AUTH
latency would silently kill voice without the gate.

### H4 — `public.obelisk.ar` accepts kind 20078/25050 — **TRUE, with capacity caveat**

`metrics.relay.publishFail === 0` after a full mesh handshake. Both
beacons (kind 20078) and signals (kind 25050) flowed through the relay
without rejections.

**However, `public.obelisk.ar` enforces a tight `restricted: Subscription
quota exceeded: 50/50` ceiling per WebSocket connection.** When the
test was previously routed through `/app` (which mounts AppShell and
its full set of group/member/admin/profile/DM subscriptions), the
bridge opened 50+ subscriptions on `public.obelisk.ar` and voice subs
got rejected with the quota message. Routing the test directly to
`/voice/<channelId>` (which only mounts `VoiceRoom`, with a much
narrower subscription footprint) kept us under the quota.

Implication for production: the dex's normal AppShell load on
`public.obelisk.ar` exceeds the per-connection sub limit. Voice
signaling specifically lands fine on this relay when the bridge isn't
overloaded, but operators can't rely on `public.obelisk.ar` as their
default voice relay if AppShell is also active. The default voice
relay should remain `wss://relay.obelisk.ar` (the operator's
whitelist-only, higher-quota relay) for production users; tests use
`public.obelisk.ar` because fresh test pubkeys aren't whitelisted on
`relay.obelisk.ar`.

### H5 — Build-cache pinning — **NOT REPRODUCED**

`window.__obeliskVoiceBuild` was present and matched the value in
`src/lib/voice/client.ts:9`
(`'2026-05-07T18:30:00Z-multi-device-keyframe-heartbeat'`). No stale
chunks were observed; this hypothesis was preventative and Phase 2/3
will keep the cache-busting constant on every deploy as before.

### H6 — `relay.obelisk.ar` rejects fresh pubkeys — **TRUE (out of scope)**

When the test initially seeded with `wss://relay.obelisk.ar`, every
subscription returned `["CLOSED", subId, "auth-required: Authentication
required: this relay only accepts whitelisted pubkeys"]`. This is the
operator's deliberate whitelist policy and is the reason the user
asked us to test against `public.obelisk.ar` instead. Documented for
future contributors who hit the same wall.

### H7 — Fast hangup detection works — **FALSE (Phase 3 target)**

When peer B's BrowserContext was closed at `16:30:19.413`, peer A's
`metrics.peers.tornDown` stayed at `0` for the full 45 s wait window.
The current hangup path relies entirely on the RTCPeerConnection's
`connectionState` transitioning to `'failed'` or `'closed'`, which
Chromium does not fire until ICE consent / DTLS keepalive failures
elapse — empirically >60 s on a clean tab close.

This is the headline gap the Phase 3 data-channel control plane
solves: a 2.5 s ping cadence + 7 s dead-peer timer brings detection
under 10 s. Until that lands, peer rosters can show ghost participants
for a minute after they leave.

## Summary of Phase 2 work prompted by this diagnosis

1. `src/lib/wot/engine.ts:29` — add `KIND_VOICE_PRESENCE` (20078) and
   `KIND_VOICE_SIGNAL` (25050) to `ALWAYS_ALLOW_KINDS`. Voice trust is
   gated by NIP-29 membership, not WoT distance.
2. `src/lib/voice/client.ts:489` — replace silent `return` on
   non-member signal with a 5 s deferred queue; drain on
   `updateRoles()`. Counter the queue (`signalsDropped.membershipDeferred`)
   and the expiry (`signalsDropped.membershipFinal`); only the latter
   is a real failure.
3. `src/lib/voice/client.ts:476` — await `bridge.waitForRelayAuth(5000)`
   before `publishBeacon()` in `enterMeshMode()`. Make the bridge
   surface that method publicly.

## Summary of Phase 3 work prompted by this diagnosis

The data-channel control plane (`obelisk-control` RTCDataChannel,
heartbeat, `peerAdded`/`peerRemoved` propagation) is the dominant
fix. Without it, mesh recovers slowly from peer disappearance and
relies entirely on the relay surviving for transitive discovery.

The headline number to validate after Phase 3: peer A detects peer B
leave in **< 10 s** in this same harness.

## Test artifacts

- Spec: `scripts/e2e/voice/two-peer-mesh.spec.ts`
- Helpers: `scripts/e2e/voice/lib-voice.ts`
- Trace (last failing run): `scripts/e2e/test-results/voice-two-peer-mesh-two-re-f1e99-onnect-via-the-public-relay-chromium/trace.zip`
- Reproduce: `npm run build && PORT=3001 npx next start &` then
  `OBELISK_E2E_BASE_URL=http://localhost:3001 npm run test:e2e:voice`.
