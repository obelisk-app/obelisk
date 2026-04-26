# Wallet — Quick Setup, Client-Side Migration, and nostr-wot Branding

**Date:** 2026-04-26
**Status:** Approved (user said "go ahead, do not wait for approval")
**Author:** Claude (brainstormed with Leon)

## 1. Goals

Three intertwined changes ship together because they touch the same code:

1. **Quick Setup via nostr-wot.** Add a one-click Lightning wallet provisioning flow against `https://zaps.nostr-wot.com` using the same NIP-98 challenge-response protocol the [nostr-wot browser extension](https://github.com/nostr-wot/nostr-wot-extension) uses. Plus a separate manual flow to claim a Lightning Address (`username@zaps.nostr-wot.com`).
2. **Full client-side wallet.** Move every wallet credential and every NWC operation off the server and into the user's browser. The server can no longer pay from any user's wallet, even if compromised. Existing manually-pasted-NWC users get a one-time auto-migration.
3. **"Powered by nostr-wot" attribution.** Small inline legend with the nostr-wot logo on every wallet surface (connect screen, connected view, send/receive confirmations, zap toast).

The security improvement is the load-bearing motivation — today's server holds an `NWC_ENCRYPTION_KEY` that can decrypt every user's NWC URI, meaning a compromised server (or a malicious operator) could drain wallets. After this change, the server has nothing to decrypt: each user's NWC URI is encrypted in their own browser with their own NIP-44-derived key.

## 2. Decisions locked in

| # | Topic | Choice |
|---|---|---|
| Q1 | Who signs the NIP-98 provisioning challenge | **Client-side** — uses the user's existing Nostr signer (NIP-07 / nsec / NIP-46) |
| Q2 | Lightning Address claim flow | **Two-step manual** — provision wallet first, then a separate "Claim a Lightning Address" card with a free-form username |
| Q3 | "Powered by nostr-wot" placement | **Wallet UI + payment receipts** — inline on the wallet card, send/receive confirmations, and zap toast |
| Q4 | Provisioning instance URL | **Hardcoded constant** `https://zaps.nostr-wot.com` — no env var, no advanced toggle |
| Q5 | Connect screen layout | **Three tabs**: Quick Setup / NWC / LNbits — one wallet at a time, switching = disconnect + reconnect |
| Q6 | Encryption key for local credential storage | **DM cache key** (`src/lib/dm/cache-key.ts`) — random 32 bytes wrapped via NIP-44 self-encrypt, kept non-extractable in WebCrypto |
| Q7 | Scope: Quick Setup only OR full migration | **Full migration** — all credentials and ops move client-side, including manual NWC paste and existing users |

## 3. Architecture overview

### 3.1 Storage

Every wallet — Quick Setup, manual NWC paste, manual LNbits — converges on a single `LocalWallet` shape stored in `localStorage['obelisk:wallet:<pubkey>']` as IV+ciphertext. Encryption uses the existing DM cache key.

```ts
type LocalWallet = {
  source: 'quick' | 'nwc' | 'lnbits';
  nwcUri: string;                // canonical credential
  label?: string;
  lnbitsInstance?: string;       // only for source='lnbits' (for diagnostics / edit later)
};
```

### 3.2 Client-side NWC operations

A React hook `useLocalWallet()` exposes a memoized `NWCClient` (from `@getalby/sdk`, the same lib the server uses today). All wallet operations call methods on this client directly. No server round-trip for balance / pay / make-invoice.

### 3.3 Zapping another user

Today server-side: `POST /api/wallet/zap` uses **both** parties' server-side credentials.

After: the sender resolves the recipient's Lightning Address via standard LNURL-pay, requests an invoice from the recipient's wallet provider (which works even when the recipient is offline — that's the whole point of LN addresses), and pays from the sender's local wallet. The server's only role is recording the zap as an audit-log event for the sidebar and analytics.

### 3.4 Public-invoice payment in chat

Today: server-side with race-protection (first payer wins on `paymentHash`).

After: the race-protection lock stays server-side (otherwise concurrent payers double-pay), but the actual NWC call moves to the client. Three-step protocol:

1. Client → server: "claim this invoice"
2. Server: atomic insert into `InvoicePayment` with `status: 'pending'`; replies winner / loser
3. Client (winner): pays via local NWC, then reports outcome back to server

A 30-second `pending → expired` sweep allows retries if the winning client crashes mid-pay.

### 3.5 Migration path

Existing users with `Wallet` rows are auto-migrated on next chat-page mount via a one-shot endpoint that returns `{ nwcUri, label }` and **deletes the row in the same DB transaction**. Plaintext is in transit over HTTPS for one round-trip, after which the URI lives only in the user's browser. The server's `NWC_ENCRYPTION_KEY` is never used again after the last migration completes.

### 3.6 nostr-wot branding

A `<PoweredByNostrWot />` component renders a small footer link `⚡ Powered by [logo] nostr-wot` pointing to `https://nostr-wot.com`. Mounted in the wallet card, the LN-address card, send/receive confirmation views, and the zap toast. Logo SVG copied from the extension's `icons/` directory into `public/nostr-wot-logo.svg`. If no SVG is available, falls back to a small wordmark (no scope blow-up).

## 4. Detailed module design

### 4.1 New libraries

| File | Purpose |
|---|---|
| `src/lib/nip98.ts` | Pure NIP-98 (kind 27235) signer envelope builder. `buildNip98Event(signer, url, method, challenge)`. Tested without network. |
| `src/lib/wallet/provisioning.ts` | Quick-Setup challenge/sign/POST against `https://zaps.nostr-wot.com`. Exports `provisionWallet`, `claimLightningAddress`, `getLightningAddress`, `releaseLightningAddress`. |
| `src/lib/wallet/local-store.ts` | `saveLocalWallet`, `readLocalWallet`, `clearLocalWallet`, `hasLocalWallet`. Encrypted with the DM cache key. |
| `src/lib/wallet/local-client.ts` | `useLocalWallet()` React hook returning `{ client, loading, error, reload, disconnect }`. Memoizes `NWCClient`. |
| `src/lib/wallet/lnurl-pay.ts` | Pure LNURL-pay resolver. `resolveLightningAddress(addr)`, `requestInvoice(callback, amountMsat, comment?)`. Tested with mocked fetch. |
| `src/lib/wallet/lnbits-to-nwc.ts` | Convert `{ instanceUrl, adminKey }` → NWC URI by calling LNbits' built-in NWC plugin endpoint. Used only by the LNbits tab. |

### 4.2 Modified components

| File | Change |
|---|---|
| `src/components/wallet/WalletPanel.tsx` | Three-tab connect screen; LN-address card; uses `useLocalWallet` for all ops; one-time `legacy-export` migration on mount; `<PoweredByNostrWot />` legend |
| `src/components/chat/MessageInput.tsx` | Zap path: `lnurl-pay` → `local-client.payInvoice` instead of `POST /api/wallet/zap`. Invoice path: `local-client.makeInvoice`. Balance: `local-client.getBalance`. |
| `src/components/chat/ZapPickerModal.tsx` | Uses `useLocalWallet` + `lnurl-pay` instead of `/api/wallet/invoice` + `/api/wallet/pay` |
| `src/components/chat/ZapToast.tsx` (or wherever it lives) | Adds `<PoweredByNostrWot />` footer |

### 4.3 Server endpoints

**Removed:**
- `POST /api/wallet`
- `DELETE /api/wallet`
- `GET /api/wallet`
- `GET /api/wallet/balance`
- `POST /api/wallet/pay`
- `POST /api/wallet/invoice`
- `POST /api/wallet/zap`

**Added:**
- `GET /api/wallet/legacy-export` — one-shot per user; returns `{ nwcUri, label }` and deletes the row atomically. Returns 404 once already-migrated.
- `POST /api/wallet/zap-receipt` — write-only audit log: `{ targetPubkey, amountMsat, channelId?, messageId?, paymentHash }`. Server records and emits the existing `InvoicePaid` socket event (or a new `ZapReceived` event if needed for sidebar). No NWC calls, no credentials.

**Refactored:**
- `POST /api/invoices/pay` → split into `POST /api/invoices/pay/claim` and `POST /api/invoices/pay/confirm`. The original endpoint path is removed.

### 4.4 Server-side teardown

After migration ships:

| Item | Disposition |
|---|---|
| `Wallet` Prisma table | Leave empty in schema; drop in a follow-up migration after one release for rollback safety |
| `src/lib/nwc.ts` | Deleted |
| `src/lib/crypto.ts` | Deleted (only consumer was `nwc.ts`; verified) |
| `NWC_ENCRYPTION_KEY` env var | Removed from `.env.production.example`, `Dockerfile` notes, `DEPLOY.md` |
| Existing tests for the removed endpoints | Deleted |

### 4.5 Powered-by component

```tsx
// src/lib/wallet/powered-by.tsx
'use client';

export function PoweredByNostrWot() {
  return (
    <a
      href="https://nostr-wot.com"
      target="_blank"
      rel="noopener noreferrer"
      className="text-[10px] text-lc-muted hover:text-lc-white inline-flex items-center gap-1 mt-2"
    >
      ⚡ Powered by
      <img src="/nostr-wot-logo.svg" alt="nostr-wot" className="h-3" />
      nostr-wot
    </a>
  );
}
```

Mount points: `WalletPanel.tsx` (connect screen, connected view, LN-address card, send view, receive view), zap toast component.

## 5. Data flow walkthroughs

### 5.1 First-time user does Quick Setup

```
1. User opens WalletPanel → no local wallet, no server wallet → connect screen, "Quick Setup" tab default
2. Click "Crear billetera"
3. Browser: provisioning.provisionWallet(signer)
   a. GET https://zaps.nostr-wot.com/api/provision/challenge → { challenge }
   b. signer.signEvent({ kind: 27235, tags: [['u', '...'], ['method', 'POST']], content: challenge })
   c. POST https://zaps.nostr-wot.com/api/provision { name: 'WoT:npub1...', event: <signed> }
   d. → { adminkey, nwcUri }
4. Browser: local-store.saveLocalWallet({ source: 'quick', nwcUri })
   a. getOrCreateCacheKey(pubkey, signer) → AES-GCM key (creates+wraps if first run)
   b. encryptToCache(key, JSON.stringify({source, nwcUri, label}))
   c. localStorage.setItem('obelisk:wallet:<pubkey>', blob)
5. WalletPanel re-renders → useLocalWallet detects → connected view shows
6. (Optional) User clicks "Reclamar dirección Lightning" in the LN-address card → enters username → claimLightningAddress(signer, 'alice') → 'alice@zaps.nostr-wot.com' is now their address
```

### 5.2 Returning user on the same browser

```
1. WalletPanel mounts
2. hasLocalWallet(pubkey) → true → useLocalWallet decrypts and instantiates NWCClient
3. Connected view renders; balance fetched via client.getBalance()
```

### 5.3 Returning user on a different browser

```
1. WalletPanel mounts
2. hasLocalWallet(pubkey) → false
3. Check legacy-export → 404 (already migrated, or never had a server wallet)
4. Connect screen shows; user clicks Quick Setup → same as 5.1
   (LNbits backend looks up wallet by pubkey-derived name → returns the SAME wallet → same NWC URI)
```

### 5.4 Existing user with server-side wallet (auto-migration)

```
1. WalletPanel mounts
2. hasLocalWallet(pubkey) → false
3. GET /api/wallet/legacy-export → { nwcUri: 'nostr+walletconnect://...', label: 'My Alby' }
   Server: BEGIN TRANSACTION → SELECT row → DELETE row → COMMIT → response sent
4. local-store.saveLocalWallet({ source: 'nwc', nwcUri, label })
5. Connected view renders. Migration silently complete. No user action needed.
```

### 5.5 Zap another user in chat

```
1. Click zap on Bob's message
2. Resolve Bob's Lightning Address (from Bob's Member.lightningAddress or profile.lud16)
3. lnurl-pay.resolveLightningAddress('bob@example.com') → { callback, minSendable, maxSendable }
4. lnurl-pay.requestInvoice(callback, amountMsat, optional zap-request event) → { invoice }
5. local-client.client.payInvoice({ invoice }) → { preimage }
6. POST /api/wallet/zap-receipt { targetPubkey: bob, amountMsat, channelId, messageId, paymentHash }
7. Server: persist + emit ZapReceived socket event for sidebar updates
8. Toast: "Zapped 1000 sats to Bob • Powered by nostr-wot"
```

### 5.6 Pay public invoice in chat

```
1. Alice posts an invoice in chat. Multiple users want to pay.
2. User A clicks "Pay" → POST /api/invoices/pay/claim { invoice }
   Server: parse, check expiry, INSERT InvoicePayment{paymentHash, payer:A, status:pending}
   → A wins → { ok: true }
3. User B clicks "Pay" 50ms later → POST /api/invoices/pay/claim
   Server: INSERT fails on unique paymentHash → { error: 'pending' }
   → B sees "Someone is paying this invoice"
4. User A: local-client.client.payInvoice({ invoice }) → { preimage }
5. User A: POST /api/invoices/pay/confirm { paymentHash, status: 'paid', preimage }
   Server: UPDATE row to status='paid', emit InvoicePaid socket event
6. (If A's tab dies after step 2) After 30s, server cron sweeps pending rows: DELETE where status='pending' AND createdAt < now - 30s. B can retry.
```

## 6. Security model

**Before this change.** Server holds `NWC_ENCRYPTION_KEY` env var. `Wallet` table has every user's NWC URI, encrypted with that key. Server can decrypt any user's URI at any time and call `payInvoice` on the underlying wallet. Compromise of the server (DB breach + env var leak) drains every wallet.

**After this change.** Server has no wallet credentials. Each user's NWC URI is encrypted in their own browser with a key wrapped via NIP-44 self-encrypt — only their own Nostr signer can unwrap it. The server cannot decrypt, cannot pay, cannot drain.

**Residual surfaces:**
1. **The user's signer.** XSS in the chat page can call our `encrypt`/`decrypt` helpers via the non-extractable WebCrypto key — but cannot exfiltrate the raw key bytes. Same model as the DM cache. Limits damage but does not eliminate it.
2. **Public invoice payment.** Server still gates the race lock — it knows who is paying which invoice and the resulting paymentHash. No fund-moving capability, but a metadata leak.
3. **Zap receipt.** Server logs `{ payer, recipient, amount, time }`. Same metadata leak as today.
4. **Legacy-export endpoint.** During migration, plaintext NWC URI is in transit over HTTPS for one round-trip. After migration completes for a user, the row is gone. After all users migrate, the endpoint can be removed.

**What this is not.** This does not encrypt at rest with the user's nsec directly (which would require signing on every load). It uses a per-account symmetric key wrapped by the nsec — same pattern as the DM cache. That trade-off (one signer interaction at first wrap, then non-extractable AES-GCM thereafter) is what the DM cache already chose, and we inherit it.

## 7. Testing strategy

### 7.1 Pure helpers (unit, Vitest)

| Module | Coverage |
|---|---|
| `lib/nip98.ts` | NIP-98 event shape (kind, u/method tags, content), tested with stub signer |
| `lib/wallet/provisioning.ts` | Each function: challenge fetch + sign + POST shape; mocked fetch; error propagation |
| `lib/wallet/local-store.ts` | Round-trip save/read; clear removes; readLocal returns null when no entry |
| `lib/wallet/lnurl-pay.ts` | Happy path; rejects malformed addresses; respects minSendable/maxSendable |
| `lib/wallet/lnbits-to-nwc.ts` | Converts admin key + URL to NWC URI; rejects bad inputs |

### 7.2 Hook (RTL)

| Module | Coverage |
|---|---|
| `lib/wallet/local-client.ts` | `useLocalWallet`: memoizes client, reloads on signer change, returns null when no wallet |

### 7.3 Components (RTL)

| Module | Coverage |
|---|---|
| `WalletPanel.tsx` | Three-tab connect; LN-address card states (no address / has address / cambiar flow); legacy migration auto-fires once on mount; `<PoweredByNostrWot />` rendered |
| `MessageInput.tsx` zap path | Uses `lnurl-pay` + `local-client`, never calls `/api/wallet/zap` |
| `ZapPickerModal.tsx` | Same — local-only payment flow |

### 7.4 API integration (Vitest)

| Endpoint | Coverage |
|---|---|
| `GET /api/wallet/legacy-export` | First call returns + deletes; second call 404s; auth required |
| `POST /api/wallet/zap-receipt` | Records the row; emits socket event; rejects bad input; auth required |
| `POST /api/invoices/pay/claim` | First payer wins; concurrent claims race; expired invoices rejected |
| `POST /api/invoices/pay/confirm` | Updates status; failed status deletes row to allow retry; rejects unknown paymentHash |
| Pending sweep | Rows older than 30s with status=pending get deleted (via cron or sweep on next claim) |

### 7.5 Removed tests

- `src/app/api/wallet/route.test.ts` (POST/DELETE/GET — endpoints gone)
- `src/app/api/wallet/balance/route.test.ts`
- `src/app/api/wallet/pay/route.test.ts`
- `src/app/api/wallet/invoice/route.test.ts`
- `src/app/api/wallet/zap/route.test.ts`
- `src/lib/nwc.test.ts` (if exists — file gone)
- `src/lib/crypto.test.ts` (file gone)

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| LNbits-to-NWC conversion fails (some LNbits instances don't expose NWC) | Detect on connect attempt; show clear error "Your LNbits instance does not support NWC" with a link to the docs |
| LNURL-pay resolution fails for a recipient (they have no LN address set) | Fall back to NIP-57 zap request via NDK; if that also fails, surface "Bob has no Lightning Address" with a help link |
| Public invoice payment leaves `pending` rows if client crashes | 30s sweep on next claim attempt; documented user-facing copy "If your tab closed, retry in 30 seconds" |
| Migration round-trip exposes plaintext URI | HTTPS-only; deleted in same DB transaction; legacy endpoint removable in a follow-up commit |
| User loses their browser localStorage (cache cleared, new device) | They re-run Quick Setup — idempotent (same npub → same wallet on the LNbits backend → same NWC URI). One extra click documented as expected behavior. |
| nostr-wot logo SVG missing from extension | Fall back to text wordmark `nostr-wot` styled with `font-mono` — no scope blow-up |
| Existing users with no `Wallet` row hit `legacy-export` | Endpoint returns 404 cleanly; no error |

## 9. Out of scope (deferred)

- Cross-device wallet sync (each device re-runs Quick Setup; idempotent on the backend)
- NIP-78 / cross-app wallet portability (nice-to-have for future spec)
- Multiple wallets per user (data model is one-per-pubkey by design)
- Server-driven scheduled zaps or background payments (no current feature requires this)
- Custom mute durations beyond presets — not relevant here, mentioned for completeness
- Migration to drop the `Wallet` table (deferred one release for rollback safety)

## 10. File-by-file change summary

**New files:**

```
src/lib/nip98.ts
src/lib/nip98.test.ts
src/lib/wallet/provisioning.ts
src/lib/wallet/provisioning.test.ts
src/lib/wallet/local-store.ts
src/lib/wallet/local-store.test.ts
src/lib/wallet/local-client.ts
src/lib/wallet/local-client.test.ts
src/lib/wallet/lnurl-pay.ts
src/lib/wallet/lnurl-pay.test.ts
src/lib/wallet/lnbits-to-nwc.ts
src/lib/wallet/lnbits-to-nwc.test.ts
src/lib/wallet/powered-by.tsx
src/lib/wallet/powered-by.test.tsx
src/app/api/wallet/legacy-export/route.ts
src/app/api/wallet/legacy-export/route.test.ts
src/app/api/wallet/zap-receipt/route.ts
src/app/api/wallet/zap-receipt/route.test.ts
src/app/api/invoices/pay/claim/route.ts
src/app/api/invoices/pay/claim/route.test.ts
src/app/api/invoices/pay/confirm/route.ts
src/app/api/invoices/pay/confirm/route.test.ts
public/nostr-wot-logo.svg                    (or fall back to text wordmark)
```

**Modified files:**

```
src/components/wallet/WalletPanel.tsx        # rewrite for three-tab + local-client + LN address card
src/components/chat/MessageInput.tsx          # zap + invoice + balance via local-client
src/components/chat/ZapPickerModal.tsx        # local-client + lnurl-pay
src/components/chat/ZapToast.tsx (or equiv)   # add <PoweredByNostrWot />
src/app/api/invoices/pay/route.ts             # DELETE this file (replaced by claim/confirm)
.env.production.example                        # remove NWC_ENCRYPTION_KEY
DEPLOY.md                                     # remove NWC_ENCRYPTION_KEY references
Dockerfile                                    # if it mentions NWC_ENCRYPTION_KEY, remove
```

**Deleted files:**

```
src/lib/nwc.ts
src/lib/nwc.test.ts (if exists)
src/lib/crypto.ts
src/lib/crypto.test.ts
src/app/api/wallet/route.ts
src/app/api/wallet/route.test.ts
src/app/api/wallet/balance/route.ts
src/app/api/wallet/balance/route.test.ts
src/app/api/wallet/pay/route.ts
src/app/api/wallet/pay/route.test.ts
src/app/api/wallet/invoice/route.ts
src/app/api/wallet/invoice/route.test.ts
src/app/api/wallet/zap/route.ts
src/app/api/wallet/zap/route.test.ts
```

**No DB schema changes in this spec.** A follow-up will drop the `Wallet` table after one release for rollback safety.

## 11. Acceptance criteria

A user can:
1. Click Quick Setup → wallet connects in under 5 seconds → balance displayed
2. Claim a Lightning Address `alice@zaps.nostr-wot.com` from the wallet panel
3. Send a Lightning payment from the wallet panel using a pasted BOLT11 invoice
4. Generate a receive invoice with a QR code from the wallet panel
5. Zap another user in chat → recipient's wallet credited (via LNURL) → toast shows success
6. Pay a public invoice posted in chat → if another user is paying it, see "Someone is paying this invoice"

Existing users:
7. Migration is automatic and silent on next chat-page mount; their existing wallet keeps working

Engineering:
8. `npm test` green
9. Server has no `Wallet` row creation path (only the legacy-export deletion path)
10. `NWC_ENCRYPTION_KEY` is no longer required by the running server
11. `<PoweredByNostrWot />` visible on every wallet surface

## 12. Implementation phases

The plan that follows breaks this into 5 phases:

- **Phase A — Pure libraries.** `nip98`, `provisioning`, `local-store`, `lnurl-pay`, `lnbits-to-nwc`, `powered-by`. Highly parallelizable.
- **Phase B — `useLocalWallet` hook + WalletPanel rewrite.** Three-tab connect screen, LN-address card, all wallet ops via local-client.
- **Phase C — Server-side new endpoints.** `legacy-export`, `zap-receipt`, `invoices/pay/claim`, `invoices/pay/confirm`. Plus the 30s pending sweep.
- **Phase D — Chat integration.** `MessageInput`, `ZapPickerModal`, zap toast.
- **Phase E — Server teardown.** Delete removed endpoints, `nwc.ts`, `crypto.ts`. Update env var docs.

Phases A is fully parallel. B depends on A. C is mostly parallel internally. D depends on B + parts of C. E depends on D being green.
