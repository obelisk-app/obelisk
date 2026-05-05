# SFU — day 1 hand-off (2026-05-04)

Resume point for the Obelisk SFU work. If you're picking this up tomorrow (or later), read this first, then `docs/sfu-system.md` for spec details and `services/sfu/README.md` for operator commands.

## Status snapshot

What lives in `main` as of 2026-05-04:

- ✅ Standalone Node service at `services/sfu/` — own `package.json`, own `tsconfig`, own scripts. Doesn't touch obelisk-dex's `src/`.
- ✅ `npm install` clean (80 packages, ~22 s).
- ✅ `tsc --noEmit` zero errors.
- ✅ `npm run build` produces `dist/` ready to run.
- ✅ Boot smoke test against `wss://relay.damus.io`: relay pool connects, advertisement (kind 31313) publishes and is acked, control listener subscribes, HTTP `/`, `/healthz`, `/rooms` serve, SIGTERM does a clean shutdown.
- ✅ Design doc + operator runbook complete (`docs/sfu-system.md`, `services/sfu/README.md`).
- ✅ Cloudflare-tunnel runner mirrors `dev-raise.sh` (idempotent, status/stop subcommands, attached PIDs).

What's structurally complete but **not yet exercised against a real browser**:

- ⚠️ werift `RTCPeerConnection` plumbing in `peer.ts` — type-checks, but the offer/answer/ICE flow with a Chrome client hasn't been smoke-tested. This is the single biggest unknown.
- ⚠️ Track forwarding fan-out in `room.ts` — the loops are wired, but the underlying werift `addTrack(remoteTrack)` from one PC's `onTrack` to another PC's sender is the trickiest werift behavior and may need adjustment.
- ⚠️ Membership gate (NIP-29 admins/members) — relies on the relay actually serving kind 39001/39002 for our test channel. Untested in the SFU context.

## What's NOT done — punch-list, ordered

### 1. Browser ↔ SFU end-to-end smoke test (~1 h, day 2 first thing)

Most important next step. Until a real browser dials in successfully and we hear audio, everything else is theoretical.

```bash
cd services/sfu
./scripts/setup.sh                                  # if not already
# Edit allow.json — add YOUR own hex pubkey (the one you'll log into obelisk-dex with)
SFU_RELAYS=wss://relay.obelisk.ar SFU_LOG_LEVEL=debug npm run raise
```

Then from a separate terminal, publish a `start`:

```bash
nak event --kind 25052 \
  --tag p="<SFU_PUBKEY>" \
  --tag e="<TEST_CHANNEL_ID>" \
  --tag t="obelisk-sfu-control" \
  --tag expiration="$(($(date +%s)+60))" \
  --content '{"action":"start","params":{"video":true,"screen":true}}' \
  --sec "<YOUR_NSEC>" \
  wss://relay.obelisk.ar
```

Watch for:
- `[call-listener] start accepted` in `sfu.log` — confirms allow-list + member gates passed.
- `[room] room active` — confirms kind 31314 published.
- `[advertise]` not in logs again unless you SIGHUP — confirms heartbeat isn't wasted.

Then open obelisk-dex in a browser, log in with the host pubkey, navigate to the test voice channel. The browser will see the SFU's beacon. **Today, the client doesn't know what to do with `["sfu","1"]`** — it'll dial the SFU as a regular peer in the mesh, which is actually almost what we want. The SFU should accept the offer.

Likely failure modes (and where to look):
- "no answer SDP produced" → werift `setLocalDescription()` without prior `addTransceiver` may not produce media-bearing SDP. Check `peer.ts:268` (`makeOffer`).
- ICE never reaches `connected` → host firewall not letting through UDP `40000-40099`, or `SFU_PUBLIC_IP` unset on a 1:1-NAT host.
- Track id mismatch (browser receives track but doesn't slot it into a tile) → `track.id` vs `track.uuid` in werift; `trackIdOf()` helper in `peer.ts:320` handles fallback.
- werift `addTrack(remoteTrack)` might not pipe RTP packets correctly when the track came from another werift PC. If audio doesn't flow, we may need to convert to encoded-RTP forwarding via `track.onReceiveRtp`.

### 2. Client-side topology switch in obelisk-dex (~3–4 h)

Currently the SFU shows up in the roster but is treated as a regular mesh peer. To actually scale, the client needs to **stop dialing other peers when an SFU is in the room**.

Files to touch:
- `src/lib/voice/types.ts` — `originPubkey?: Hex` is already declared. Confirm.
- `src/lib/voice/client.ts` — add `dialOnly(pubkeys: string[])` method; in roster handler, detect `roster.find(r => r.tags.includes(['sfu','1']))` and switch into SFU mode (one PC to that pubkey only).
- `src/lib/voice/peer.ts` — when receiving a `trackinfo` with `originPubkey`, store it on the track and surface to `onTrack` callback so the UI can key tiles by origin pubkey not remote pubkey.
- `src/components/voice/VoiceRoom.tsx` — in SFU mode, the "remote peer" tiles should be one per `originPubkey`, not one per RTC-remote.
- `src/components/voice/VoiceControls.tsx` — add a "Start SFU call" button that publishes kind 25052; needs an SFU picker UI (filter kind 31313 by `["allow", myPubkey]`).
- New file `src/lib/voice/sfu-discovery.ts` — subscribe to `{ kinds: [31313], '#t': ['obelisk-sfu-advertisement'] }` and surface available SFUs to the UI.

This is where we touch `src/` for the first time. Tests required (CLAUDE.md rule).

### 3. Tests (~2 h, paired with §2)

Zero tests today in `services/sfu/`. Mirror the obelisk-dex voice test layout:

```
services/sfu/src/
├── auth.test.ts           pure unit — isAllowedToStart / canDialRoom / canManageRoom
├── membership.test.ts     fake relay, refcount, ready timeout
├── call-listener.test.ts  allow-list gate, action dispatch, expiration drop
├── room.test.ts           start → publish 31314 → close, with mocked werift PCs
└── peer.test.ts           glare drop, signal handling, sequence numbers
```

Add `vitest` to `services/sfu/package.json` (sibling of root's vitest setup but standalone — separate config). Use `obelisk-dex/src/lib/voice/multi-client.integration.test.ts` as the template for in-process FakeRelay routing.

### 4. Reconnect ladder on the SFU side (~1 h)

`peer.ts` currently closes on `'failed'` and waits for redial. Add the ICE-restart phase that the browser already implements:

```ts
// peer.ts attachListeners(), in connectionStateChange handler:
if (state === 'failed') {
  if (this.iceRestartCount < 3) {
    this.pc.restartIce();
    this.iceRestartCount++;
    return;
  }
  this.close();
}
```

Don't bother with the "polite waits for impolite to reset" path — the browser still drives it.

### 5. Mid-PC track lifecycle (~1 h)

Today: a peer turning their camera off doesn't propagate — the SFU keeps forwarding the now-dead track to everyone else. To fix:
- Watch `pc.onnegotiationneeded` from the remote (browser sends a renegotiation when toggling)
- After `setRemoteDescription` of an `offer`, diff transceivers — any with `direction: 'inactive'` or removed → emit `onTrackEnded` for that track id.

### 6. Mediasoup migration (~2 days, future work)

Production hardening. werift transcodes when forwarding (each forwarded track decodes + re-encodes per receiver — kills CPU at video scale). Mediasoup forwards encoded RTP packets natively.

The migration is server-side only — the wire seen by browsers stays kind 25050 SDP/ICE. We write an adapter that translates between vanilla SDP and mediasoup's RtpCapabilities/Producer/Consumer model. Keep the file structure; replace `peer.ts` and `room.ts` internals.

### 7. Encrypted signaling (~1 day, paired with mesh)

Adopt NIP-59 gift-wrap on kind 25050/25052 once obelisk-dex's mesh transport does. Tracked in `docs/webrtc-p2p-nostr-signaling.md` §9.

## Open questions to revisit

- **Glare handling** — v0 SFU is unconditionally impolite (werift can't rollback). If we see stalled negotiations in real-world testing, options are: (a) close+rebuild PC on glare, (b) hand-roll a rollback that resets transceiver state, (c) swap werift for `@roamhq/wrtc` which supports rollback. (a) is the easiest fallback.
- **Allow-list policy** — no "open" mode in v0. If users ask for an SFU that anyone can start calls on, add a `SFU_ALLOW_ALL=1` env that puts `["allow", "*"]` in the advertisement and skips the layer-2 check. Decide whether to ship this.
- **SFU picker UX** — should clients auto-select the closest/least-loaded SFU, or always force a manual pick? Manual is safer (trust); auto is friendlier.
- **Multi-SFU per channel** — what if two SFUs both publish kind 31314 for the same channelId? Today the client picks the first it sees. Replaceable on `(kind, pubkey, d-tag)` so they don't clobber each other. Need a tiebreaker rule (by `created_at`? by operator preference list?).

## How to resume tomorrow

```bash
# 1. Sanity check we didn't break anything overnight
cd services/sfu
npm run typecheck                                # should be clean
npm run build                                    # should be clean

# 2. Boot the SFU (no tunnel needed for the smoke test)
SKIP_TUNNEL=1 SFU_LOG_LEVEL=debug npm run raise

# 3. In another terminal, publish a start event (see §1 above)

# 4. In a browser, dial the test voice channel and watch sfu.log
```

If §1 works (browser connects, audio flows), proceed to §2. If it doesn't, the failure mode in `sfu.log` plus `chrome://webrtc-internals` will tell you which werift call to instrument.

## Files touched in day 1

```
docs/sfu-system.md                         (new — 499 lines, design + event spec)

services/sfu/                              (new — entire standalone service)
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
├── README.md                              (operator runbook, 363 lines)
├── HANDOFF.md                             (this file)
├── src/                                   (14 .ts files, ~2300 lines total)
│   ├── nip-kinds.ts
│   ├── types.ts
│   ├── log.ts
│   ├── config.ts
│   ├── identity.ts
│   ├── auth.ts
│   ├── relay.ts
│   ├── advertise.ts
│   ├── membership.ts
│   ├── signaling.ts
│   ├── call-listener.ts
│   ├── peer.ts
│   ├── room.ts
│   ├── room-manager.ts
│   ├── http-server.ts
│   └── index.ts
└── scripts/
    ├── setup.sh
    ├── generate-keys.mjs
    └── sfu-raise.sh
```

Nothing in `obelisk-dex/src/` changed. Day 2 starts touching `src/lib/voice/` for the client-side topology switch.

## Pointers (curated, in suggested reading order)

1. [services/sfu/README.md](README.md) — operator commands, runbook
2. [docs/sfu-system.md](../../docs/sfu-system.md) — design, event spec, deploy
3. [src/peer.ts](src/peer.ts) — werift integration; the file most likely to need adjustment in §1
4. [src/room.ts](src/room.ts) — fan-out forwarding logic
5. [docs/voice-system.md](../../docs/voice-system.md) — mesh client this needs to integrate with in §2
