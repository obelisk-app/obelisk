# Direct Messages — Re-enable with outbox model, encrypted-at-rest cache, and request coalescing

**Date:** 2026-04-26
**Status:** Design — pending review
**Scope:** Browser-side DM data layer rewrite. UI components kept; storage, fetch, and live-sync paths replaced.

---

## Problem

Obelisk has full DM code (NIP-04 + NIP-17 send/receive, components, store) gated behind `DM_FEATURE_ENABLED = false`. The flag was set because the existing implementation has structural problems we want to fix before re-enabling:

1. The cache stores **decrypted plaintext** in localStorage (`dm-cache.ts`'s `decrypted: Record<string, string>`).
2. There is no **outbox-model** routing — sends and fetches go to whatever relays NDK happens to be connected to, not the recipient's published inbox/outbox.
3. There is no **request coalescing** — entering the DM view fires many independent `fetchEvents` calls instead of batching them into a few multi-filter REQs per relay.
4. History fetches use `await ndk.fetchEvents(...)` which blocks until every relay has responded — events from fast relays don't render until the slow ones return.
5. Profile and relay-list lookups are not browser-side cached, so opening DMs hits the relays repeatedly for data that rarely changes.
6. The Zustand DM store uses a single localStorage key — multi-account state can leak across logins.
7. Bunker users get a signer popup for every preview decryption on every cold load.

## Goals

Re-enable DMs with the following premises baked in:

- **Outbox model** for both profile (kind 0) and relay-list (kind 10002 + 10050) lookups. Always include `purplepag.es` for profile aggregation.
- **Local cache for profiles + relay lists**, per-account, so we never search twice.
- **DMs disabled when `ndk.signer` is unavailable** (read-only state); enabled when present.
- **Signature verification** on every DM event before it reaches the cache.
- **Parallel-relay loading** — events from each relay surface to the UI as they arrive; never block on the slowest relay.
- **Deduplication** by event id throughout.
- **localStorage stores only encrypted-at-rest data.** Wire-encrypted Nostr events as-is, plus an AES-GCM-encrypted plaintext cache whose key is itself wrapped by the user's signer.
- **Decrypt only for display.** Plaintext lives in RAM (Zustand state); never persisted in raw form.
- **Multi-account isolation** at the cache layer — every storage key suffixed with `:{myPubkey}`.
- **Request coalescer** with a small debounce window so opening the DM view fires one multi-filter REQ per relay, not many independent calls.
- **Stale-while-revalidate with content-diff** for relay lists (kind 10002 / 10050): use cached value first; refresh in the background; only emit a subscriber notification when content actually changed.
- **Live subscription** while the DM view is open, so incoming DMs arrive without polling.
- **Incremental sync** — every DM filter uses a `since` cursor derived from the latest persisted event for that filter.
- **Follow-aware eviction** — DMs from/to followed users are never evicted by the LRU cap; the cap applies only to non-followed partners.
- **Defense in depth against XSS** — non-extractable WebCrypto key + a baseline CSP header.

## Non-goals

Captured as post-merge follow-ups (see end of doc), not part of this PR:

- Performance benchmarks (relay latency, localStorage write throughput).
- Replacing NDK in non-DM paths.
- `connect-src` CSP allowlist — Nostr relays are user-configurable.
- A full XSS pen-test.

---

## Architecture

```
┌─────────────────────────────── Browser ───────────────────────────────┐
│                                                                       │
│  Components (DMList, DMChat, NewDMModal, ProtocolPrompt) — unchanged  │
│                                  │                                    │
│                                  ▼                                    │
│  Zustand: useDMStore (per-account namespacing)                        │
│   • messages: in-RAM only (decrypted)                                 │
│   • threads, readCursors, protocolOverrides (persisted, per-pubkey)   │
│                                  │                                    │
│                                  ▼                                    │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │   DMSessionProvider (mounted while DM view is open)         │     │
│  │   • opens SimplePool live subscription                      │     │
│  │   • holds the coalescer                                     │     │
│  │   • orchestrates: history fetch → decrypt → store dispatch  │     │
│  └─────────────────────────────────────────────────────────────┘     │
│              │                  │                  │                  │
│              ▼                  ▼                  ▼                  │
│   ┌──────────────────┐  ┌──────────────────┐  ┌─────────────────┐    │
│   │  RequestCoalescer│  │  ProfileCache    │  │  RelayListCache │    │
│   │  (50ms debounce, │  │  (kind 0,        │  │  (kind 10002,   │    │
│   │   merges filters,│  │   24h SWR)       │  │   kind 10050,   │    │
│   │   per-relay REQ) │  │                  │  │   6h SWR)       │    │
│   └──────────────────┘  └──────────────────┘  └─────────────────┘    │
│              │                  │                  │                  │
│              └──────────────┬───┴──────────────────┘                  │
│                             ▼                                         │
│   ┌──────────────────────────────────────────────────────────────┐   │
│   │       SimplePool (nostr-tools) — READ path only              │   │
│   │       • subscribeMany() for streaming, per-relay fan-out     │   │
│   │       • signature verification on every event                │   │
│   └──────────────────────────────────────────────────────────────┘   │
│                                                                       │
│   ┌──────────────────────────────────────────────────────────────┐   │
│   │  NDK signer — WRITE path: encrypt, sign, publish, decrypt    │   │
│   └──────────────────────────────────────────────────────────────┘   │
│                                                                       │
│   ┌──────────────────────────────────────────────────────────────┐   │
│   │  localStorage (per-pubkey keys: obelisk:dm:{pk}, ...)        │   │
│   │  • DM events: wire-encrypted (NIP-04 ciphertext, gift wraps) │   │
│   │  • Plaintext secrets: AES-GCM(dmCacheKey, plaintext)         │   │
│   │  • Profiles + relay lists: kind-0 / 10002 / 10050 raw events │   │
│   │  • dmCacheKey is bunker-wrapped (NIP-44 self-encrypt)        │   │
│   └──────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────────┘
```

**Boundaries:**
- **Read = SimplePool.** **Write/encrypt/decrypt = NDK signer.** Clean split.
- All reads funnel through the coalescer. No code path opens its own relay subscription except `DMSessionProvider`.
- All caches use **per-pubkey storage keys**.
- `DMSessionProvider` is the only React tree that subscribes; unmounting closes the live sub.

---

## Data flow

### Cold open of the DM view

```
1. DMSessionProvider mounts.
2. Hydrate Zustand "threads" list from cache (sync, instant).
3. Coalescer opens its 50ms debounce window. Threads view enqueues:
     · profile fetch for every partner pubkey (cache miss or >24h)
     · relay-list fetch (kind 10002 + 10050) for every partner (cache miss or >6h)
     · DM incremental sync filters with `since` cursor:
         { kinds:[4],    '#p':[me],     since: cursorIn }
         { kinds:[4],    authors:[me],  since: cursorOut }
         { kinds:[1059], '#p':[me],     since: cursorWrap }
     · my own follow list:
         { kinds:[3],    authors:[me],  since: cursorKind3 }
4. Window closes → coalescer merges all filters per relay set.
     · Profile/relay queries → purplepag.es + my own read relays + each partner's outbox.
     · DM queries → my kind-10050 inbox relays + my kind-10002 read relays.
5. SimplePool.subscribeMany(...) opens ONE multi-filter REQ per relay.
6. Events stream in:
     · kind 0 / 10002 / 10050 → cache; emit subscriber update only if content changed.
     · kind 3 → update in-memory follow set; re-evaluate eviction protection.
     · kind 4 / 1059 → DMSession dispatcher:
         a. verifyEvent(sig) — drop if invalid.
         b. dedupe by event.id against the per-account cache.
         c. persist the WIRE-ENCRYPTED event to localStorage.
         d. for messages currently visible (active thread + thread-list previews):
              decrypt-on-demand → store plaintext in Zustand RAM state and in the
              AES-GCM-encrypted secrets cache for fast subsequent renders.
7. Subscription stays open for live updates until DMSessionProvider unmounts.
```

### Open a thread

```
1. setActiveDM(partnerPubkey).
2. Hydrate messages from cache; decrypt the visible viewport.
3. Coalescer enqueues a per-thread `since`-cursor sync, transiently adding the
   partner's NIP-65 write relays to the relay set for that REQ.
4. As events arrive: verify → dedupe → persist wire form → decrypt visible window.
```

### Send a DM

```
1. Optimistic message inserted into Zustand with isPending=true.
2. NDK signer encrypts (NIP-17 default; NIP-04 if user override).
3. Resolve recipient relays:
     · NIP-17 → recipient's kind-10050 (RelayListCache).
     · NIP-04 → recipient's kind-10002 read relays (RelayListCache).
   Cache miss = synchronous coalesced fetch.
4. Publish via NDK to those relays + our own write relays.
5. Success → replace optimistic message with the published event id; persist wire
   form to cache. Failure → mark sendError; UI shows retry.
```

### Account switch

```
- Auth store calls resetAllClientState() (already wired).
- DM caches are per-pubkey-keyed → other account's cache untouched.
- Zustand DM store namespace key changes (new account's keyspace).
```

---

## Module breakdown

### New

| Module | Purpose |
|---|---|
| `src/lib/dm/pool.ts` | SimplePool singleton + `verifyEvent` wrapper. Browser-only. Exposes `getDMPool()`. |
| `src/lib/dm/coalescer.ts` | `RequestCoalescer` class. `enqueue(filters, relays, onEvent, onEose)` debounces 50ms, then merges filters per relay-set and issues `subscribeMany`. Per-relay 5s timeout, dedup by event id. |
| `src/lib/dm/cache-key.ts` | KEK pattern: `getOrCreateCacheKey(myPubkey, signer)` generates a 32-byte random key on first run, NIP-44-self-encrypts it via the signer, persists wrapped form. Subsequent calls unwrap (one signer call) and import as a non-extractable WebCrypto AES-GCM key. RAM-only after import. |
| `src/lib/dm/profile-cache.ts` | Browser-side kind-0 cache, 24h SWR. Always queries `purplepag.es` + my read relays + the partner's outbox. Diffs by `created_at` before notifying subscribers. |
| `src/lib/dm/relay-list-cache.ts` | Browser-side kind-10002 + kind-10050 cache, 6h SWR. Same diff-before-notify rule. Returns `{ inbox, readRelays, writeRelays, stale }`. |
| `src/lib/dm/follows.ts` | Cold-load seed + live-sub-driven kind-3 follow set. No TTL — the live subscription is the freshness mechanism. |
| `src/lib/dm/dm-cache.ts` | **Replaces** the old one. Per-pubkey `obelisk:dm:{me}` key. Stores wire-encrypted events + AES-GCM-encrypted secrets blob per event. Tracks `since` cursors per (kind, direction). Follow-aware LRU eviction. |
| `src/lib/dm/dm.ts` | **Replaces** the old one. Public API: `loadHistory`, `subscribeLive`, `sendDM`, `verifyAndIngest`. Reads via coalescer; writes/encrypt/decrypt via NDK. |
| `src/components/dm/DMSessionProvider.tsx` | Mounts when DM view opens. Owns the live subscription. Provides context: `useDMSession()` exposes `loadThread`, `loadMore`, `sendMessage`, `decryptForDisplay`. |

### Changed

| Module | Change |
|---|---|
| `src/lib/dm/dm-inbox.ts` | Kept; minor signature alignment with new module structure. |
| `src/store/dm.ts` | (1) Per-account namespacing — persist key becomes `obelisk-dm-store:{pubkey}`. (2) `messages` is RAM-only; only `protocolOverrides` and `readCursors` persist. (3) New `decryptInRange(start, end)` action. |
| `src/components/dm/DMList.tsx` | Uses `useDMSession`. Disabled state when `!ndk.signer`. |
| `src/components/dm/DMChat.tsx` | Uses `useDMSession`. Decrypts viewport on mount + on scroll. |
| `src/components/dm/NewDMModal.tsx` | Uses `ProfileCache` to resolve npub → profile preview. |
| `src/lib/feature-flags.ts` | `DM_FEATURE_ENABLED = true`. |
| `next.config.ts` | Add baseline CSP headers (see CSP section). |

### Deleted

| Module / code | Reason |
|---|---|
| Old `src/lib/dm.ts` (replaced) | Decrypted-plaintext code paths violate "never persist decrypted". Replaced by `src/lib/dm/dm.ts`. |
| Old `src/lib/dm-cache.ts` `decrypted` field | Same. |
| `runRelaySync` preview-decryption-into-cache loop | Same. |
| `addDMInboxRelays` in `src/lib/nostr.ts` | Replaced by `RelayListCache` + coalescer. |

### Module graph (no cycles)

All `dm/*` paths below are under `src/lib/dm/`. UI lives at `src/components/dm/`. The old top-level `src/lib/dm.ts`, `src/lib/dm-cache.ts`, and `src/lib/dm-inbox.ts` are deleted; their content is split across the new `src/lib/dm/` modules.

```
components/dm/* → DMSessionProvider → dm/dm.ts → dm/coalescer.ts → dm/pool.ts
                                    → dm/profile-cache.ts → dm/coalescer.ts
                                    → dm/relay-list-cache.ts → dm/coalescer.ts
                                    → dm/follows.ts → dm/coalescer.ts
                                    → dm/dm-cache.ts (storage) → dm/cache-key.ts (WebCrypto)
                                    → NDK (signer only)
```

---

## Storage schema

All keys scoped by `myPubkey`. Account switch is a no-op for the cache layer.

```
localStorage:

  obelisk:dm-cache-key:{myPubkey}
    string                          // bunker-encrypted (NIP-44) wrapped AES key

  obelisk:dm:{myPubkey}
    {
      events: {
        [eventId]: {                // wire-encrypted Nostr event, unchanged
          id, pubkey, kind, created_at, content, tags, sig
        }
      },
      secrets: {                    // AES-GCM-encrypted-at-rest with dmCacheKey
        [eventId]: aesGcm({
          plaintext: string,        // decrypted body (NIP-04) or rumor content (NIP-17)
          rumorId?: string,
          senderPubkey: string,
          recipientPubkey: string,
          createdAt: number,
        })
      },
      cursors: { nip04In, nip04Out, nip17Wrap, kind3 }
    }

  obelisk:profiles:{myPubkey}
    { [partnerPubkey]: { event: <kind-0 raw, sig-verified>, lastCheckedAt: ms } }

  obelisk:relays:{myPubkey}
    {
      [partnerPubkey]: {
        outbox: { event: <kind-10002>, lastCheckedAt: ms },
        inbox:  { event: <kind-10050>, lastCheckedAt: ms },
      }
    }

  obelisk:follows:{myPubkey}        // cold-load seed only; freshness via live sub
    {
      event: <kind-3 raw, sig-verified>,
      pubkeys: string[],            // flattened for O(1) protection lookups
      lastCheckedAt: ms,
    }

  obelisk-dm-store:{myPubkey}       // Zustand persist
    {
      protocolOverrides: { [partner]: 'nip04' | 'nip17' },
      readCursors:       { [partner]: msTimestamp },
      // NOT persisted: messages (RAM only), threads (rebuilt from cache),
      //                isLoading*, activeDMPubkey
    }
```

### Eviction policy

The 2000-event cap applies only to the **evictable pool** — events whose partner is not in the current follow set. Events from/to followed partners are protected and never evicted by the cap. Eviction is re-evaluated each write with the current follow snapshot, so unfollowing a partner makes their messages eligible on the next overflow.

If we are not yet hydrated with a follow list (cold start, never fetched), treat all events as protected for that session.

### Why no second at-rest layer for wire events

The DM events themselves (NIP-04 ciphertext, kind-1059 gift wraps) are already encrypted by the sender. Adding another encryption layer on top buys nothing. The AES-GCM layer applies only to the `secrets` blob — the per-event decrypted plaintext that we want fast access to.

### How the three layers compose at read time

Decryption flow when rendering a message:

```
1. RAM (Zustand `messages`): if present, render — done.
2. AES-GCM secrets cache: if present, WebCrypto-decrypt → put in RAM → render.
3. Wire-encrypted event: NDK signer-decrypt (NIP-04 nip04Decrypt or
   NIP-17 giftUnwrap) → put in secrets cache (AES-GCM) AND in RAM → render.
```

Step 3 is the only path that calls the signer; it runs at most once per event per device (its result lands in the secrets cache and stays there for the device's lifetime). After the first render, all subsequent renders of that message are RAM hits or WebCrypto-only.

---

## Defense in depth (CSP + key handling)

**Goal:** if XSS slips into the page, the AES cache key (and therefore the user's DM history) must not be exfiltrable.

**1. Non-extractable WebCrypto key.**
After unwrapping `dmCacheKey`, import with `extractable: false`:

```ts
crypto.subtle.importKey(
  'raw', dmCacheKey,
  { name: 'AES-GCM' },
  /* extractable */ false,
  ['encrypt', 'decrypt'],
)
```

`subtle.exportKey()` then throws. An attacker can call our `decryptAt(eventId)` helper (always possible against any browser-side crypto) but cannot exfiltrate the raw key bytes for offline decryption.

**2. CSP headers via `next.config.ts`:**

```
default-src 'self';
script-src   'self' 'wasm-unsafe-eval';
style-src    'self' 'unsafe-inline';
img-src      'self' data: blob: https:;
connect-src  'self' wss: https:;
font-src     'self' data:;
frame-ancestors 'none';
object-src   'none';
base-uri     'self';
form-action  'self';
upgrade-insecure-requests;
```

`script-src` is the high-value lock: `'self'` only, no `'unsafe-inline'`, no `'unsafe-eval'`. `'wasm-unsafe-eval'` permits noble-curves / nostr-tools wasm paths.

**3. Operational rules:**
- Raw `dmCacheKey` bytes never leave the local scope of `getOrCreateCacheKey()` after `importKey`. Pass the `CryptoKey` handle, never the bytes.
- The bunker-encrypted wrapped key is the only persisted form; an XSS reading localStorage gets a useless ciphertext.
- No `console.log(wrappedKey)` or equivalent anywhere in the codebase.

---

## Audit — every premise, mapped to enforcement and tests

| # | Requirement | Where in design | Audit test |
|---|---|---|---|
| 1 | Use outbox: query `purplepag.es` for profiles | `profile-cache.ts` always includes `purplepag.es` + partner's NIP-65 write relays | Unit: profile fetch dispatches REQ to `purplepag.es` |
| 2 | Outbox model for relay info | `relay-list-cache.ts` populates outbox + inbox; send routes via these | Unit: NIP-17 send addresses recipient's kind-10050; NIP-04 send addresses kind-10002 |
| 3 | Cache profiles + relays locally, don't search twice | Per-account caches with SWR; `lastCheckedAt` ensures no refetch within TTL | Unit: second `getProfile(pk)` within TTL → zero relay calls |
| 4 | DMs disabled when `ndk.signer` absent | `DMList`/`DMChat` gate on `!ndk.signer` | Component test: render with no signer → input disabled, banner shown |
| 5 | Verify DMs via signature | `dm/pool.ts` wraps every event with `verifyEvent`; invalid events dropped with warn | Unit: poisoned-sig event is dropped, never reaches store |
| 6 | Load from all relays in parallel, show as they come | `SimplePool.subscribeMany` per-relay fan-out; `onevent` dispatches per-relay | Integration: two mocked relays (slow + fast) — fast event reaches store before slow returns |
| 7 | Deduplicate as we update | Coalescer keeps `Set<eventId>`; `dm-cache.putEvent` keyed by id | Unit: same event from 5 relays → 1 store entry, 1 cache write |
| 8 | localStorage stores DMs encrypted | Wire-encrypted events + AES-GCM-encrypted secrets only; no plaintext field | Unit: scan persisted blob — no plaintext substring of a known test message |
| 9 | Decrypt only when showing on screen, never store decrypted raw | Decryption in `DMSessionProvider.decryptForDisplay`; secrets blob is AES-GCM at rest; Zustand `messages` excluded from `partialize` | Unit: persist hook output never includes `messages`; manual storage flush leaves no plaintext |
| 10 | Multi-account, all encrypted | Every cache key suffixed with `:{myPubkey}`; Zustand persist name dynamic | Unit: switch accounts in same tab → A's cache is unreachable from B's session |
| 11 | Coalesce relay requests with debounce | `RequestCoalescer.enqueue` 50ms window | Unit: 4 enqueues within 50ms → 1 multi-filter REQ per relay |
| 12 | NIP-65: use cached first, refresh in bg, only update if changed | `relay-list-cache` SWR with content-hash diff | Unit: same kind-10002 fetched twice → no subscriber notification on second |
| 13 | Live subscription while DM view is open | `DMSessionProvider` opens `subscribeMany` on mount, closes on unmount | Unit: unmount → `SubCloser.close()` called |
| 14 | Only request DMs newer than latest persisted | `cursors.*` derived from `max(created_at)` per cached events; injected as `since` | Unit: with cached events at t=1000, fetch issues `since: 1000` |
| 15 | Always keep DMs from/to followed users | Eviction protected pool exempt from cap | Unit: 3000 messages with all partners followed → 0 evictions |
| 16 | LRU eviction applies only to non-followed partners | Evictable pool capped at 2000 | Unit: 1500 followed + 2500 non-followed → 1500 + 2000 = 3500 events retained |
| 17 | Follow list always fresh | Live kind-3 sub updates the in-memory set; cache is cold-load seed only | Unit: newer kind-3 received → eviction protection re-evaluates against the new set |
| 18 | Locally generated cache key, wrapped by signer once per session | `dm/cache-key.ts` `getOrCreateCacheKey()` | Unit: first call generates + wraps; second within session is RAM-cached, zero signer calls; reload calls `nip44Decrypt` exactly once |
| 19 | Plaintext cache encrypted at rest | `dm-cache.putSecret`/`getSecret` use AES-GCM via WebCrypto | Unit: persisted blob contains no plaintext; same blob round-trips correctly |
| 20 | Bunker called at most once per session for decryption | Session-start KEK unwrap; per-event decrypt via WebCrypto | Integration with counting mock signer: 50 thread previews → `nip44Decrypt` called exactly 1 time |
| 21 | AES key non-extractable | `cache-key.ts` `importKey(..., false, ...)` | Unit: `subtle.exportKey('raw', key)` rejects |
| 22 | CSP blocks inline script execution | `next.config.ts` headers | E2E: response headers contain `script-src 'self'` without `'unsafe-inline'` |
| 23 | localStorage never contains raw `dmCacheKey` | Static check + runtime test | Unit: scan localStorage after key generation; only `obelisk:dm-cache-key:{me}` present, equal to wrapped form |

---

## Testing strategy

Tests are non-negotiable per CLAUDE.md. Co-located, Vitest + RTL, run via `npm run test`.

### Unit / module tests

- `src/lib/dm/pool.test.ts` — `verifyEvent` accepts valid sigs; rejects swapped sig, swapped pubkey, tampered content.
- `src/lib/dm/cache-key.test.ts` — first-call generates + wraps; in-session RAM cache (zero signer calls); reload calls `nip44Decrypt` exactly once; non-extractable assertion; logout clears the key handle.
- `src/lib/dm/dm-cache.test.ts` — `putSecret`/`getSecret` round-trip; persisted blob contains no plaintext substring; per-account isolation; eviction with no follows = plain LRU at 2000; eviction with 1500 followed + 2500 non-followed = 1500 + 2000; cursors monotonic; corrupted ciphertext for one event doesn't break others.
- `src/lib/dm/coalescer.test.ts` — 4 enqueues in window → 1 REQ per relay; out-of-window enqueue starts new REQ; per-relay 5s timeout; dedup; cancellation.
- `src/lib/dm/profile-cache.test.ts` — first fetch hits `purplepag.es` + my read relays + partner outbox; second within 24h is cache-only; refresh past TTL returns stale immediately, emits update only if `created_at` newer; multiple-relay dedup.
- `src/lib/dm/relay-list-cache.test.ts` — same SWR shape with 6h TTL; bg refresh with identical content emits no notification; content-hash diff respected.
- `src/lib/dm/follows.test.ts` — cold load reads cached kind-3 with no relay call; subscription emits newer kind-3 → in-memory set updates; older kind-3 is ignored.
- `src/lib/dm/dm.test.ts` — `loadHistory` uses `since` cursor from cached max; fresh partner has `since` undefined; `sendDM('nip17')` routes to recipient's kind-10050; `sendDM('nip04')` routes to kind-10002; `sendDM` with no signer rejects; `verifyAndIngest` drops poisoned sigs and dedupes by id.

### Component tests

- `src/components/dm/DMSessionProvider.test.tsx` — mounts opens live sub with the expected filter set; unmounts closes it; `useDMSession` context throws outside provider; live event updates re-render.
- `src/components/dm/DMList.test.tsx` — disabled state with no signer; 50 cached threads render with exactly 1 mock signer call (the KEK unwrap).
- `src/components/dm/DMChat.test.tsx` — only visible viewport is decrypted; scroll-up triggers `loadHistory` with `until` cursor; optimistic message replaces cleanly on send.

### Store tests

- `src/store/dm.test.ts` — `partialize` output never contains `messages`; persist key includes the active pubkey; account switch starts with empty overrides + cursors.

### Integration

- `src/lib/dm/integration.test.ts` — two mocked relays (slow + fast); fast event reaches the store before slow returns. Multi-account: A's cache untouched after switching to B. Disk inspection: 20 sent + 20 received messages, scan all of localStorage, assert no plaintext substring of any message body. Single-bunker-call: 50 thread previews → `nip44Decrypt` called exactly once.

### CSP smoke test

- `src/__tests__/csp.test.ts` — assert `Content-Security-Policy` header on `/` and `/chat` contains `script-src 'self'` without `'unsafe-inline'`.

---

## Post-merge follow-ups

These are intentionally out of scope for this PR. Candidates for `/schedule` agents or follow-up issues:

- **Performance benchmarks** — relay latency distributions, localStorage write throughput, end-to-end DM render budget.
- **Replacing NDK in non-DM paths** — once the SimplePool + coalescer pattern is proven in DMs, consider adopting it for chat/profile reads broadly.
- **`connect-src` allowlist** — Nostr relays are user-configurable today, so a strict CSP `connect-src` is incompatible with arbitrary relay support. Investigate runtime CSP via response headers per request, or a relay-allowlist UX.
- **A full XSS pen-test** — defenses are designed in (non-extractable key + CSP), but offensive testing (third-party engagement) is out of scope.
- **`subscribeLive` teardown only flips a flag** — the closer returned by `subscribeLive` sets `cancelled = true`; events keep flowing on the wire and `verifyAndIngest` keeps writing to cache, only the consumer-callback is suppressed. Plumb a real `SubCloser` handle from the coalescer up through `subscribeLive` so unmount + account-switch close the relay subscriptions. Until then, the underlying sub auto-closes after `subscriptionTimeoutMs` (5s default), which bounds but does not eliminate the leak.
