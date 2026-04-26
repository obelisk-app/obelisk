# Direct Messages

Obelisk supports private 1:1 chat between Nostr identities, with strict privacy guarantees and outbox-aware relay routing. DMs are entirely client-driven over Nostr — the Obelisk server is **not** in the data path. This document describes the user experience, the on-disk storage model, the protocols supported, and how to operate the feature on a self-hosted instance.

## What you get

- **NIP-17 by default** — modern, gift-wrapped, metadata-leak-resistant. Relays see only kind-1059 wraps signed by an ephemeral pubkey, addressed to the recipient's published inbox.
- **NIP-04 fallback**, selectable per-thread via the protocol-override picker — for chatting with clients that don't yet support NIP-17. The choice persists per partner.
- **Live updates** — a single multi-filter subscription stays open while the chat view is mounted; new DMs appear without polling.
- **Outbox routing** — sends are addressed to the recipient's published kind-10050 (NIP-17 inbox) or kind-10002 (NIP-04 read relays). No "lost in the void" sends because the recipient happens to use a different relay set.
- **Profile previews** in the recipient picker, sourced from `purplepag.es` plus the partner's own NIP-65 write relays.
- **Multi-account isolation** — every cache key, blob, and read cursor is namespaced by the active pubkey. Logging into a different identity on the same browser sees an empty DM state, by design.

## Privacy and storage model

- **Plaintext is never persisted.** Every DM byte on disk is encrypted: NIP-04 ciphertext from the wire, NIP-17 gift wraps from the wire, plus a per-event AES-GCM blob holding the decrypted body for fast preview rendering.
- The AES-GCM blob is encrypted with a **per-account symmetric key** (the KEK pattern):
  - 32 random bytes generated locally with `crypto.getRandomValues`.
  - NIP-44-self-encrypted by your signer (you sign for yourself).
  - The wrapped form is what lives in `localStorage`. The raw key never touches disk.
- The AES key is imported as a **non-extractable** WebCrypto key — `crypto.subtle.exportKey('raw', key)` rejects. An XSS attacker can call our encrypt/decrypt helpers but cannot exfiltrate the raw bytes for offline use.
- On reload the signer is consulted **once** per session to unwrap. After that, every preview decrypts via WebCrypto with no further signer prompts.
- **Read-mode (no signer):** if the signer is unavailable (extension locked, bunker not connected, session restored from a public-key-only login), the DM list shows existing threads but the New DM button and message input are disabled. Reconnect a signer to re-enable.

## What's stored, where

All keys are scoped by the active account's pubkey, written to `localStorage`:

| Key | Contents | Format |
|---|---|---|
| `obelisk:dm-cache-key:{myPubkey}` | The AES-GCM cache key | NIP-44-wrapped by your signer; useless without it |
| `obelisk:dm:{myPubkey}` | Wire events, plaintext blobs, sync cursors | `events` (wire-encrypted DMs), `secrets` (AES-GCM-wrapped plaintext per event ID), `cursors` (per-kind/direction `since` timestamps) |
| `obelisk:profiles:{myPubkey}` | Partner kind-0 events with 24h SWR | Plain JSON; public profile metadata only |
| `obelisk:relays:{myPubkey}` | Partner kind-10002 + kind-10050 with 6h SWR | Plain JSON; public relay-list events only |
| `obelisk:follows:{myPubkey}` | Your own kind-3 contact list | Plain JSON; public follow data |
| `obelisk-dm-store:{myPubkey}` | Per-account UI state | Protocol overrides + device-local read cursors. **Messages are explicitly excluded from disk** — they live in RAM only and re-hydrate from the encrypted cache on reload. |

The wire-encrypted layer (`obelisk:dm:…events`) and the plaintext layer (`obelisk:dm:…secrets`) are kept in the same JSON blob for atomic flushing; both are protected, but only the secrets layer requires the cache key to read.

## Cache eviction

The DM event store applies a **follow-aware LRU**:

- Cap is **2000 evictable events** by default.
- Events whose partner is in your kind-3 follow set are **protected** and never evicted by the cap.
- The cap applies only to non-followed partners. Unfollowing someone makes their messages eligible for eviction on the next overflow.
- For NIP-17 wraps where the partner can't be determined without unwrapping (the wrap pubkey is ephemeral), the event is treated as "unknown partner" and is eligible for eviction — once you open the thread and the rumor is decrypted, it lands in the secrets cache and is rendered from there.

**Cold-start protection.** If `hydrateFollows` has not yet completed for the active account (no entry in localStorage *and* no live kind-3 has arrived), every event is protected for that session. The cache only becomes evictable once the follow list has been positively known to be fetched (an empty Set after hydration counts as "fetched, you follow no one" — full LRU applies). This avoids dropping messages from people you do follow just because we haven't met your kind-3 yet.

## Sync semantics

- **Coalesced REQs.** Opening the DM view fires one multi-filter REQ per relay group, with a 50 ms debounce window. A burst of `loadHistory(partnerA)` + `loadHistory(partnerB)` calls at app start collapses to a single subscription per relay.
- **Cursor-based incremental sync.** Each filter carries a `since` derived from the highest `created_at` we've already cached for that filter — `nip04In`, `nip04Out`, `nip17Wrap`, and `kind3` are tracked independently. A subscription that wakes up after a long offline period only pulls the delta.
- **Stale-while-revalidate.** Profile and relay-list caches return the cached value instantly and kick off a background fetch only when their TTL has elapsed (24h for profiles, 6h for relay lists). A subscriber callback fires only when the new event actually changes the content (newer `created_at` AND different tags) — refreshes that find the same data bump `lastCheckedAt` silently.
- **Live subscription.** `DMSessionProvider` opens one persistent subscription against your inbox relays for the four kinds (`4`, `1059`, `3`, plus your own outbound `4`s). It runs while the DM view is mounted and is torn down on unmount or pubkey change.
- **Verified on ingest.** Every incoming event is signature-verified through `verifyDMEvent` before being written to the cache; the verifier strips the `verifiedSymbol` cache that `nostr-tools` puts on objects so a tampered `{ ...goodEv, sig: badSig }` cannot impersonate a verified event.

## Sending a DM

1. Pick a recipient via npub, nprofile, or by clicking a member's profile elsewhere in Obelisk.
2. The recipient's profile preview resolves through the profile cache (always queries `purplepag.es` plus any extra test relays configured for the cache).
3. The recipient's relay list (kind-10002 + kind-10050) is fetched on first contact; subsequent sends reuse the cached value until the 6h TTL expires.
4. By default, sends use **NIP-17**. A protocol picker surfaces when the recent slice of the thread looks like NIP-04 — if you accept, all future sends in that thread go to NIP-04 until you change it again. The override persists per-partner in `obelisk-dm-store:{myPubkey}`.
5. Routing:
   - **NIP-17 sends** publish to the partner's kind-10050 `inbox` relays.
   - **NIP-04 sends** publish to the partner's kind-10002 `readRelays`.
   - If the partner has published neither, we fall back to the configured NDK pool — your message may still land on a relay they read, but delivery is best-effort.
6. Sends are optimistic: a pending bubble appears immediately, replaced by the real event on publish or marked failed (with a retry button) on error.

## Operational notes

- **Self-hosted instances.** No server-side configuration is required. DMs go directly between Nostr clients; the Obelisk server, its database, and Socket.io are uninvolved. There is no DM-related env var, migration, or admin setting.
- **Bunker users.** Expect:
  - **One signer prompt per session** for the KEK unwrap (or per first-ever account, for the initial KEK encrypt).
  - **One signer prompt per send** to encrypt the outgoing event (NIP-04 `encrypt` or NIP-17 gift-wrap).
  - **Zero prompts** for cached-message decryption — the secrets cache uses the WebCrypto AES key directly.
- **Logout.** Clears the in-RAM AES key handle. The wrapped key remains on disk and is re-unwrapped on the next login with that account. To wipe a specific account's DM history from disk, clear the six `obelisk:…:{myPubkey}` and `obelisk-dm-store:{myPubkey}` entries from `localStorage`.
- **CSP headers.** Production deployments serve a baseline CSP set in `next.config.ts`: `script-src 'self' 'wasm-unsafe-eval'`, `connect-src 'self' wss: https:`, `frame-ancestors 'none'`. This is defense-in-depth for the non-extractable AES key — no inline scripts can be injected to script the WebCrypto API on a victim's behalf.

## Known limitations

- **NIP-17 thread sidebar appearance is decrypt-gated.** Because a kind-1059 gift wrap exposes nothing about its sender or recipient until unwrapped, NIP-17 threads only appear in the DM list **after the user has decrypted at least one message** in that thread (typically by opening it once on the device). Once decrypted, the rumor metadata is cached in the secrets layer and the thread is durable across reloads. This is a privacy-preserving consequence of NIP-17, not a bug — but it does mean a brand-new device hydrating from relay-only state will only see NIP-04 thread previews until the user clicks into wraps.
- **No "load older" paging yet.** The chat view decrypts the most recent 50 cached events on thread-open. The infrastructure for paging (an `until` cursor on `loadHistory`, a top-of-list intersect sentinel) is in place but not wired to the UI.
- **Per-tab cache.** `dm-cache` mirrors localStorage in RAM with microtask-batched flushes. Multiple Obelisk tabs in the same browser share localStorage but do not subscribe to each other's mutations — open in only one tab to avoid stale-read races.
- **No per-account "wipe" button in the UI yet.** Clearing a single identity's DM data is a manual `localStorage.removeItem` step today.
- **`subscribeLive` teardown is best-effort.** Unmounting the DM view (or switching accounts) flips a cancellation flag that suppresses the consumer callback, but the underlying `SimplePool` subscription remains open until its 5-second `subscriptionTimeoutMs` elapses. Events continue flowing on the wire and into the cache during that window. Tracked in the spec's post-merge follow-ups.

## Threat model summary

| Threat | Mitigation |
|---|---|
| **Disk leak** (someone reads localStorage offline) | Sees only ciphertext: NIP-04/NIP-17 wire events + AES-GCM blobs. No plaintext DM body is ever written to disk. The KEK is itself NIP-44-wrapped. |
| **RAM leak in the live tab** | Currently-decrypted messages are visible. Equivalent to a full session compromise. The AES key handle is in RAM but non-extractable. |
| **XSS** | The non-extractable AES key cannot be exfiltrated for offline decryption. Defense-in-depth via the `script-src 'self'` CSP. An attacker can drive the live tab but can't take the key with them. |
| **Relay observers — NIP-17** | See only ephemeral-pubkey wraps addressed to the recipient's inbox. No sender, no timestamp authenticity, no thread linkage. |
| **Relay observers — NIP-04** | See full metadata: sender pubkey, recipient pubkey, timestamp, ciphertext length. Plaintext stays encrypted. |
| **Tampered events** | `verifyDMEvent` strips the `verifiedSymbol` cache before re-checking, so spoofed events derived from `{ ...verifiedEv, sig: badSig }` are rejected on ingest. |

## Troubleshooting

- **DM input is disabled, "Sign in with a signing-capable method" tooltip.**
  Your signer is not active. For NIP-07 extensions, unlock the extension. For NIP-46 bunkers, ensure the connection is live and reload. Public-key-only sessions cannot send.

- **Sent message but recipient says they didn't get it.**
  Check that the recipient has published a kind-10050 (for NIP-17) or kind-10002 (for NIP-04). Without one, the outbox client falls back to the NDK pool, which may not match the recipient's read set. Recipients can fix this once for everyone by publishing their relay list with any modern Nostr client.

- **NIP-17 thread is missing from the list after a fresh login.**
  Expected. NIP-17 threads only join the sidebar after at least one message has been decrypted on this device — open the partner's npub via "New DM" once, and the thread will be picked up and persisted in the secrets cache.

- **Old previews / avatars look wrong after a profile change.**
  Profile cache is 24h SWR. The next time the chat view opens with that partner, the background fetch will pick up the new kind-0 and re-render. If you need to force-refresh, clear `obelisk:profiles:{myPubkey}` from localStorage.

- **Bunker prompts on every message decrypt.**
  Should never happen — preview decryption uses the WebCrypto cache key, not the signer. If you see it, the KEK unwrap probably failed (signer error during `nip44Decrypt`); reload to retry. Persistent failures usually mean the bunker connection silently dropped.

## Spec & plan

- Design: [`docs/superpowers/specs/2026-04-26-direct-messages-design.md`](superpowers/specs/2026-04-26-direct-messages-design.md)
- Implementation plan: [`docs/superpowers/plans/2026-04-26-direct-messages.md`](superpowers/plans/2026-04-26-direct-messages.md)

Source layout:

- `src/lib/dm/dm.ts` — public API: `loadHistory`, `subscribeLive`, `sendDM`, `verifyAndIngest`, `detectNip04InRecent`.
- `src/lib/dm/dm-cache.ts` — encrypted-at-rest event + secrets cache, follow-aware LRU.
- `src/lib/dm/cache-key.ts` — KEK pattern, non-extractable AES-GCM key.
- `src/lib/dm/coalescer.ts` — 50 ms debounced REQ batcher.
- `src/lib/dm/profile-cache.ts`, `relay-list-cache.ts`, `follows.ts` — SWR caches for partner metadata + your kind-3.
- `src/lib/dm/pool.ts` — `SimplePool` singleton + `verifyDMEvent`.
- `src/components/dm/DMSessionProvider.tsx` — owns the live subscription, hydrates follows, derives the cache key, exposes `useDMSession()` to the chat tree.
- `src/components/dm/DMList.tsx`, `DMChat.tsx`, `NewDMModal.tsx`, `ProtocolPrompt.tsx` — UI.
- `src/store/dm.ts` — Zustand store; `ensureDMStoreForAccount` swaps the persist key on login.
- `next.config.ts` — CSP headers.
- `src/lib/feature-flags.ts` — `DM_FEATURE_ENABLED`, currently `true`.
