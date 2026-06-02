# Mesh — Failure Modes

Every previously-silent failure in the mesh has been wired into a
counter on `VoiceClient.metrics`. The `?debug=voice` overlay reads
the live values; the Playwright harness asserts on them. Counters
that should stay at zero on a healthy mesh are marked **(zero
expected)**.

## Membership / WoT

| Failure | Handler | Counter |
|---|---|---|
| Signal arrives before `updateRoles()` admits the sender | Defer up to 5 s; replay on admit | `signalsDropped.membershipDeferred` (transient — ok), `signalsDropped.membershipFinal` **(zero expected)** |
| Deferred queue overflows (8 per peer / 64 total) | Drop oldest | `signalsDropped.deferredOverflow` **(zero expected)** |
| WoT engine denies a kind 25050 from a non-member | `KIND_VOICE_PRESENCE` + `KIND_VOICE_SIGNAL` are in `ALWAYS_ALLOW_KINDS` so this path is unreachable in normal operation. Defense-in-depth check stays in client.ts:490 | `signalsDropped.wot` **(zero expected)** |
| Self-echo (relay broadcasts our own beacon back to us) | Drop at receiver | `signalsDropped.self` (non-zero baseline; not a failure) |
| Signal addressed to someone else | Drop at receiver | `signalsDropped.notForMe` (non-zero baseline; not a failure) |

## Relay

| Failure | Handler | Counter |
|---|---|---|
| Rate-limit response (`OK ... false "rate-limit:..."` or "slow down") | Exponential backoff: 1s, 2s, 4s, 8s with ±25% jitter, max 4 retries | `rateLimit.hit`, `rateLimit.backoffMs` |
| Publish fails for any non-rate-limit reason (signing error, network down, relay reject) | Re-thrown to caller; counter incremented | `relay.publishFail` **(zero expected)**, `relay.lastError` |
| NIP-42 AUTH not yet complete when first beacon publishes | Best-effort: wait up to 5 s for auth (fire-and-forget — beacon goes out anyway, bring-up burst covers retry) | `relay.authWaited`, `relay.authTimedOut` (occasional non-zero on slow relays — ok) |

## Peer

| Failure | Handler | Counter |
|---|---|---|
| Peer's PC reaches `'failed'` or `'disconnected'` | Reconnect ladder: requestReset (polite) → ICE restart up to 3× (impolite) → hard reset | `peers.iceExhausted` increments only when the ladder gives up |
| Peer crashed / network blackout (no traffic for 7 s) | Control-channel `onDead('heartbeat-lost')` → `tearDownPeer` | `peers.tornDown` |
| Peer cleanly leaves | Control-channel `bye` (sub-100 ms) → `tearDownPeer` | `peers.tornDown`, `signals.byeViaControl` |
| Peer's data channel never opens (10 s timeout) | `onDead('open-timeout')` → `tearDownPeer` | `peers.tornDown` |
| Local tab close / refresh | `beforeunload` / `pagehide` → control-channel `bye` to all peers, then `pc.close()` | `peers.tornDownByUnload` (on the leaver), `signals.byeViaControl` (on the receivers) |
| Multi-tab same pubkey reset | `sessionId` mismatch detected → local hard reset | `peers.sessionMismatchResets` |
| Glare (simultaneous offers) | Perfect negotiation: polite rolls back, impolite proceeds. Tested by `scripts/e2e/voice/glare.spec.ts` | (assertion-only, no counter) |
| Mid-call media glare leaves peers stuck on `Media syncing` | After a polite peer rolls back its local offer to answer a colliding remote offer, it keeps the rolled-back local media revision pending and sends a follow-up offer once stable | Assertion in `scripts/e2e/voice/two-peer-mesh.spec.ts`: audio and camera RTP bytes must flow both ways |

## Topology

| Failure | Handler | Counter |
|---|---|---|
| Capacity overflow (>5 mesh participants) | Lex-deterministic eviction (everyone agrees on who's in), AND active rejection: every in-cap peer sends `bye { byeReason: 'room-full' }` to the over-cap arrival → joiner surfaces "Room is full" error and leaves on its own | (no counter; verified by `scripts/e2e/voice/six-peer-rejection.spec.ts`) |
| ICE candidate arrives before remoteDescription | Buffer in `pendingIce[]`; drain after `setRemoteDescription` succeeds | (silent — no more `"The remote description was null"` warnings) |
| SFU advertised on the channel but transport fails | `SfuClient.start` rejects → `enterMeshMode()` (mesh fallback) — except for `voice-sfu` channels which surface the error instead | `signalsDropped.sfuRouted` |

## What the `?debug=voice` overlay shows

Live, polling every 500 ms:

- top counters: connected peers, ever-connected, torn-down (split:
  unload vs other), ICE-exhausted
- control channel: opened count, ping/pong totals, last RTT
- discovery: relay-discovered count, control-discovered count
- signals: sent/received, bye via control vs relay
- dropped (highlighted red when non-zero on the "should be zero" set):
  wot, membFinal, overflow
- relay: beacons sent/received, publishFail, auth waits/timeouts,
  last error string
- rate-limit: total hits, cumulative backoff ms
- last 50 events from the ring buffer (kind, reason, peer, payload)

Open with `?debug=voice` on any voice URL. Production-safe — no PII
beyond pubkey prefixes.
