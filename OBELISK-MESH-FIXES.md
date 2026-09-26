# Obelisk mesh voice — audit & fix plan

_Audit date: 2026-09-26. Scope: mesh (P2P WebRTC) voice channels across obelisk-dex (client),
obelisk-relay (public.obelisk.ar + lacrypta-relay.obelisk.ar), coturn, and obelisk-sfu's mesh test peer.
SFU (mediasoup) channels are out of scope except where they share plumbing._

## TL;DR

Mesh is broken by **several independent failures stacked on top of each other**. Any one of the
first three is enough to break a call:

| # | Problem | Where | Confidence |
|---|---|---|---|
| 1 | **TURN server is down since 2026-09-17** (coturn segfaulted; systemd gave up). Users behind NAT/CGNAT can't connect at all. | infra | Verified |
| 2 | **Voice subscriptions get rate-limited closed and the client never re-subscribes.** The relay's "unindexed query" budget (since 2026-09-18) counts the voice filters `{kinds:[20078]}` / `{kinds:[25050]}` as scrapes; the dex treats a rate-limit CLOSE as permanent. | relay + dex | Verified in logs |
| 3 | **Writes before AUTH are rejected with the wrong error.** An EVENT on a not-yet-authenticated socket gets `restricted: … not whitelisted` instead of `auth-required:`, so nostr-tools never auto-AUTHs + retries. Beacons/SDP on a fresh or reconnected socket are silently lost. | relay | Verified in code + live |
| 4 | Ghost peers kept alive by `peer`-tag gossip eat the 4-person room cap → real joiners get `room-full`. | dex | Code-level |
| 5 | 9 s connect timeout vs. serialized NIP-07 signing (one signature per ICE candidate) tears peers down mid-negotiation. | dex | Code-level |
| 6 | Rebuilt peers reuse the same `sessionId`, which nobody checks → stale offers/answers land on the new connection. | dex | Code-level |
| 7 | SFU mesh test peer can't work: ephemeral (non-whitelisted) identity, no AUTH retry on publish, no `onauth` on subscriptions, and werift has no SDP rollback (glare breaks). | obelisk-sfu | Verified in logs |

Relay forwarding itself is **fine**: with a whitelisted, authenticated key, lacrypta-relay delivered
every beacon and signal in a live probe (both `e`-tagged and `h`-tagged, `#p`-filtered and unfiltered).

---

## Evidence

### 1. TURN down
- Prod dex `.env.local`: `NEXT_PUBLIC_TURN_URLS=turn:89.167.77.78:3478?transport=udp,…tcp`
  (`89.167.77.78` is this host). SFU uses the same TURN (`SFU_TURN_URLS`).
- `systemctl status coturn` → `failed (Result: core-dump) since Thu 2026-09-17 14:10:54 -03`,
  `signal=SEGV`, last run used **20 ms** of CPU (crash-on-start → systemd hit its start limit
  despite `Restart=on-failure`).
- Nothing listens on 3478: STUN binding request to UDP 3478 → no reply; TCP 3478 → refused.
  (Control: `stun.l.google.com:19302` answers.)
- dex TURN username/credential **match** `/etc/turnserver.conf` — config isn't the problem, the process is.
- Host firewall is open (ufw inactive, INPUT ACCEPT). Cloud-provider firewall not verifiable from the box.
- Old test-peer logs show the same shape: roster sees users (signaling works), connections go
  `connecting` → `failed`, never `connected`.

### 2. Rate-limited voice subscriptions
- `obelisk-relay/src/unindexed_query.rs:78` — `would_scrape` = no ids, no authors, no tags. Both voice
  filters qualify (`since` doesn't count). Budget: 10/min per connection, burst 20 (commit `12ed751`,
  shipped in `v2026.09.22-console-rework`). Runs **before** the auth check, so auth-rejected REQs burn budget too.
- Logs, last 6 h: `Refusing unindexed REQ over budget: kinds=[20078]` → **4× lacrypta, 7× public**.
- dex: voice subs live in `transport.ts` (`{kinds:[20078]}`, `{kinds:[25050], since:now-60}`); the
  watchdog (`VOICE_SUB_WATCHDOG_MS=2500`) re-issues REQs quickly, and `subscribeWatched`
  (`nostr-bridge/client.ts:~4828-4874`) stops retrying forever on a quota/rate-limit CLOSE — voice
  passes no `onQuotaOrRateLimitClose`, so the roster or signal feed just dies silently.

### 3. `restricted` instead of `auth-required`
- `obelisk-relay/src/groups_event_processor.rs:~478` — `if !self.is_allowed(&context.authed_pubkey)`
  returns `Error::restricted("Access denied: your pubkey is not whitelisted…")` even when
  `authed_pubkey` is `None` (i.e. simply not authenticated yet).
- nostr-tools only runs AUTH-and-retry for `auth-required:` prefixes.
- Same bug caused the **SFU restart loop** (1 243 PM2 restarts): every 5-min advertisement refresh hit a
  fresh socket, got `restricted`, the watchdog saw "all write relays silent" and killed the process every
  10 min. **Fixed client-side in obelisk-sfu `src/relay.ts` on 2026-09-26** (explicit AUTH + retry);
  verified: refreshes at 04:33/04:38 acked, no restart since.
- Live probe (this audit): subscriptions opened before AUTH finished were CLOSED `auth-required` and are
  only reopened if the subscription carries an `onauth` handler.

### 4–6. Client logic (obelisk-dex)
- **Ghost gossip**: beacon `peer` tags = connected + `discovery.effectivePeers()` (which folds in *other
  beacons'* `knownPeers`) + passive hints (`client.ts:1178-1185`, `transport.ts:162-167, 373-383`). Two
  live peers re-advertise a departed pubkey to each other forever; each ghost costs a 9 s open-timeout +
  redial, and ghosts count toward `MAX_PARTICIPANTS = 4` (`client.ts:93, 1343-1346, 2040`) → `room-full`.
- **Timeout vs signing**: `INITIAL_CONNECT_TIMEOUT_MS = 9000` (`peer.ts:22`); trickle ICE is on for NIP-07,
  so offer + answer + every candidate are separate signatures, serialized through `signer-queue.ts`
  (`MAX_IN_FLIGHT = 1`, no timeout; commit `c8977d9`, 2026-08-22). Past 9 s → `open-timeout` → teardown.
- **Session reuse**: after a timeout, `tearDownPeer(…, true)` rebuilds with `notifyRemote:false`
  (`client.ts:1733, 1880`); `sessionId` is per client, not per peer (`client.ts:223`), and
  `peer.ts handleSignal` never checks it.
- Leave beacons use `expiration = now-1`, which the relay's NIP-40 middleware drops before delivery →
  departed users linger for up to the 45 s TTL (cosmetic).
- Tests: `vitest src/lib/voice` → 185 pass, but everything real (relays, TURN, AUTH, whitelists) is
  mocked; an unhandled `RangeError: Maximum call stack size exceeded` near `client.ts:2055` is printed.

### 7. SFU mesh test peer
- `test-peer-spawner.ts:90-112` defaults mesh peers to an **ephemeral key** → not whitelisted on either relay.
- Live (04:32 today): `publish beacon had rejections: lacrypta-relay: restricted: … not whitelisted`,
  `peers= 0` for its whole life.
- `test-peer-mesh.mjs`: bare `pool.publish` (same AUTH race as #3), subscriptions without `onauth`/`onclose`
  (silently deaf), and 18× `rollback threw Cannot read properties of undefined (reading 'split')` — werift
  doesn't implement SDP rollback, so perfect-negotiation glare can't resolve.
- Shares `SFU_RTP_PORT_MIN/MAX` (50000-50199) with mediasoup as its ICE port range → possible contention.

---

## Fix plan

Ordered by *impact ÷ effort*. Phase 0 alone should make most mesh calls work again.

### Phase 0 — Ops (today, ~30 min)
1. **Bring coturn back and keep it up.**
   - Run it in the foreground once to see the crash: `turnserver -c /etc/turnserver.conf --log-file=stdout`.
     If it segfaults on startup, try dropping `listening-ip=0.0.0.0` (let it bind all interfaces itself)
     and/or adding `relay-ip=89.167.77.78`; if still crashing, upgrade coturn (4.6.1 has known SEGVs) or run
     the `coturn/coturn` Docker image with `--network host`.
   - Harden the unit: drop-in with `Restart=always`, `RestartSec=5`, `StartLimitIntervalSec=0`.
   - Verify from outside: a STUN binding on UDP 3478 answers, and a TURN allocation with the configured
     credentials succeeds (e.g. `turnutils_uclient -u … -w … 89.167.77.78`); confirm the cloud firewall
     allows UDP/TCP 3478 and UDP 49152-49999.
   - **Monitoring**: a 1-min check (cron or the agents manager) that sends a STUN binding and alerts when it
     fails — this outage went unnoticed for 9 days.
2. No dex rebuild needed for this step (TURN URL/creds unchanged).

### Phase 1 — Relay (obelisk-relay, one release)
1. **Return `auth-required:` for unauthenticated writes** — `groups_event_processor.rs:~478`: when
   `context.authed_pubkey.is_none()`, return `Error::auth_required(...)`; keep `restricted` only for an
   authenticated key that isn't allowed. Same audit for the REQ path (`:376-381`).
2. **Exempt ephemeral kinds (20000-29999) from the unindexed-query budget** — `unindexed_query.rs:78`: a
   filter whose kinds are all ephemeral can't scrape stored data (nothing is stored). Optionally skip the
   DB query entirely for such filters.
3. **Run the budget after the auth check** so auth-rejected REQs don't consume it.
4. (Nice to have) Honour NIP-40 on *stored* events only, or special-case "leave" beacons so they're
   delivered live; and consider restricting live delivery of `p`-tagged 25050 to the tagged recipient
   (today any admitted subscriber can read other users' plaintext SDP — IP addresses leak).
5. Fix the "Open to all pubkeys" description on public.obelisk.ar — WoT is on, so outsiders are denied.

### Phase 2 — Client (obelisk-dex)
1. **Index the voice filters** (works even before the relay fix): roster `{kinds:[20078], '#e':[channelId]}`,
   signals `{kinds:[25050], '#p':[selfPubkey]}` (`transport.ts` subscribe sites). Both remain one filter per REQ.
2. **Never let voice subs die**: pass `onQuotaOrRateLimitClose` for voice and retry with backoff
   (e.g. 5 s → 60 s) instead of giving up; surface "reconnecting to voice…" in the UI.
3. **AUTH before voice REQs/EVENTs** on the pinned voice relay: sign AUTH for the voice relay regardless
   of which server is active (`bridge/client.ts:1087`), and on `restricted`/`auth-required` publish
   rejections do AUTH + one retry (same pattern as the obelisk-sfu fix).
4. **Kill ghost gossip**: only advertise directly observed peers (own connections + beacons seen within
   TTL); drop second-hand `knownPeers` from `peer` tags or age them out; count only directly-beaconed or
   connected peers toward `MAX_PARTICIPANTS` (`client.ts:1178, 1343, 2040`; `transport.ts:373`).
5. **Signing budget**: `trickle:false` (bundle candidates into the offer/answer) for every signer except a
   local nsec; raise `INITIAL_CONNECT_TIMEOUT_MS` to ~20 s for NIP-07 and 45 s for NIP-46; give the signer
   queue a per-request timeout and a priority lane for voice.
6. **Per-peer sessions**: generate `sessionId` per peer connection; drop signals whose `sessionId` doesn't
   match; send `bye`/`requestReset` when rebuilding (`client.ts:1733, 1880`, `peer.ts handleSignal`).
7. Leave beacon: use `expiration = now + 5` with `status:left` so it's delivered.
8. Investigate the `RangeError: Maximum call stack size exceeded` near `client.ts:2055` from the test run.

### Phase 3 — SFU mesh test peer (obelisk-sfu) — ✅ DONE 2026-09-26 (`obelisk-sfu` main `f8a4007..5a791ed`)
1. ✅ Mesh test peers now sign as the **SFU identity** by default (admitted on both relays once
   authenticated); `identityMode: 'ephemeral'` still available.
2. ✅ `scripts/test-peers/relay-auth.mjs`: AUTH + one retry on `restricted`/`auth-required` publish
   rejections; per-relay subscriptions with `onauth`, logged close reasons and backoff reopen. Used by
   both the mesh and SFU test peers. Filters are indexed (`#p:[self]`, `#e:[channel]`).
3. ✅ Glare: the current script already resets instead of rolling back (the `rollback threw` errors were
   from May logs) — nothing to change.
4. ⏭ Separate ICE port range — left as is (not observed to break; changing it needs the cloud firewall
   to allow a new range).
5. ✗ Not needed: the SFU key **is** admitted on public.obelisk.ar — the earlier rejections there were
   the pre-AUTH race, not a missing whitelist entry.

Verified live: the test peer's beacons on lacrypta-relay's MESH channel were accepted and received by an
independent subscriber (before: rejected, `peers=0` for its whole life).

### Phase 4 — Prove it and keep it proven
1. **End-to-end smoke test** (script, runnable from the agents manager): two headless Chromium clients with
   whitelisted keys join a mesh channel on each relay, assert `connectionState === 'connected'` and audio
   RTP flowing within 20 s; run with `iceTransportPolicy:'relay'` too, to prove TURN.
2. Run it after every relay/dex deploy and hourly; alert on failure.
3. Unit tests for: ghost ageing, sessionId mismatch, rate-limit re-subscribe, AUTH-retry on `restricted`.

---

## Suggested order of execution

1. Phase 0 (coturn) → quick manual test between two real users on different networks.
2. Phase 2.1 + 2.2 + 2.3 (client can ship independently of the relay, fixes #2 and #3 from our side).
3. Phase 1.1 + 1.2 (relay release; protects every client, including third-party ones).
4. Phase 3 (test peer) → then Phase 4 smoke test uses it.
5. Phase 2.4–2.8 (robustness).

## Already done
- obelisk-sfu `src/relay.ts`: explicit NIP-42 AUTH + single retry when a publish is rejected before AUTH
  (deployed 2026-09-26 04:28 UTC; SFU no longer restarts every 10 minutes).
- Phase 3 (test peers) — see above. All obelisk-sfu work is on `main`.
