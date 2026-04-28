# Auth & Session Persistence

How Obelisk keeps users signed in across reloads, back-navigation, and mobile tab eviction.

## Two layers of persistence

1. **Backend session cookie** (`session`, httpOnly, 7 days) — identifies the user to the server. Set by `POST /api/auth/verify` after signature verification.
2. **Client signer payload** (`localStorage['nostr-signer-payload']`) — lets NDK rebuild the Nostr signer after a full page reload so the user can sign new events without logging in again.

Identity is **always** derived from the backend cookie via `restoreSession()` in `src/store/auth.ts`. The localStorage payload only rebuilds the in-memory signer — it never determines who the user is.

## Signer payload by login method

| Login method | Payload stored | Restored by |
|---|---|---|
| NIP-07 (extension) | none — extension provides the signer | re-instantiating `NDKNip07Signer` on `/chat` mount |
| nsec | `{ type: 'nsec', privkey: <hex> }` | `restoreRemoteSigner()` |
| NIP-46 bunker | `{ type: 'bunker', bunkerUrl, localPrivkey }` | `restoreRemoteSigner()` |

Without a persisted payload, a full reload kills the in-memory signer. `/chat` detects `!ndk.signer` for nsec/bunker and forces `logout()` — previously this caused silent logouts on mobile whenever the browser evicted the tab (back-nav, backgrounding, BFCache miss).

## Security tradeoff: nsec in localStorage

Persisting the nsec payload means the user's **root Nostr private key** lives in `localStorage` in plaintext. Any XSS on the domain can exfiltrate it, and unlike a bunker's delegated `localPrivkey`, the nsec is non-revocable — compromise means losing the identity across all Nostr apps.

This is the conventional tradeoff for Nostr web clients that accept nsec. The alternatives were considered and rejected for now:
- **Memory-only (pre-fix behavior):** users got logged out on every mobile reload. Unusable.
- **IndexedDB + passphrase:** better security, but adds a passphrase prompt on every reload. Deferred.
- **Discourage nsec, prefer NIP-07/bunker:** still accepted, but nsec remains available.

Users who don't want their nsec in localStorage should log in via NIP-07 (browser extension) or NIP-46 (bunker) instead.

## Logout

`logout()` in `src/store/auth.ts` calls `clearSignerPayload()`, which removes the localStorage entry. It also hits `/api/auth/logout` to invalidate the server session.
