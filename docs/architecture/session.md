# Session and current-user profile

`BridgeProvider` mounts `SessionProvider` for the chat app and interactive public viewers. The bridge remains the only owner of credentials, signer lifetime, encrypted persistence and relay state. The session provider projects its public account state into one external store; it does not create another login system or copy private keys into React context.

## React API

Import account hooks from `src/hooks/session/useSession.ts`. Prefer the smallest hook needed: `useMyPubkey`, `useIsLoggedIn`, `useSignerReady`, `useSessionNotice`, or `useSessionProfile`. `useSession` reads the complete public snapshot and is appropriate only when a surface needs all of it. Selector results must be stable values or references, not newly allocated objects.

`useSessionActions` returns stable login, logout, profile-edit and generated-profile preparation commands. Login wizard hooks and the profile editor live in `src/hooks/session/`; their services live in `src/services/session/`. Forms retain their own drafts, validation and progress. The provider holds the confirmed public profile, and publishing an edit updates that profile through the bridge's normal event ingestion.

The SDK's local login widget still handles method selection and remote pairing. Its temporary provider disables automatic restore and uses memory-only signer storage. The app bridge adopts a confirmed result and owns the durable session. Imported or generated private keys are transient wizard inputs until the person confirms; they are never fields in the session snapshot.

## What a subscription means

A React subscription is an in-memory listener: when a bridge store changes, React is told to read its latest snapshot. It is not itself a WebSocket. Some bridge readers also ensure the requested data is available, which can schedule a relay lookup. RelayHub coordinates the actual relay sockets and deduplicates matching requests.

One mounted session provider subscribes once to each identity field and once to the active user's profile, regardless of the number of consumers. `useSyncExternalStore` compares each consumer's selected value, so changing the profile does not rerender components that only read the public key. Other users' profiles, messages, groups and relay connection state remain bridge concerns and retain their own hooks.

Cleanup removes listeners; it does not log out or dispose the page bridge. StrictMode remounts must not create a second session. Public marketing pages do not mount either provider: they read a lightweight saved-account projection and load the logout service only when requested.

## Account isolation

Every login, restore and logout invalidates earlier asynchronous session work. A delayed connection, vault read, signer warmup or remote pairing cannot reinstate an account after logout. A login whose lazy module has not loaded is also cancelled by a newer login or logout intent.

Profile edits capture both the public key and the session generation. Upload authorization, relay lookup, signing and publication check that the same session still owns the operation. Reconnecting with the same public key still creates a different generation. Account changes discard dirty profile drafts and prevent an old save from closing a new editor. Resetting a form also releases it for a new submission; an older request cannot overwrite its busy state, errors or success callback. Retained signer adapters check session ownership before queued work and after asynchronous results, and a new session operation clears memoized decrypted plaintext.

Before bridge adoption, a saved-session marker keeps the reconnecting screen visible. Once adopted, an explicit bridge restoration state controls the gate: a valid account with no cached shell keeps reconnecting after a failed first relay handshake, while corrupt or unavailable credentials end restoration. A stale storage entry cannot hide the login screen indefinitely.

## Folder responsibilities

Shared TypeScript contracts live in `src/types/session/`; the React context lives in `src/contexts/session/`; the provider's markup lives in `src/providers/session/`. Pure runtime input validation belongs in `src/schemas/`, while side effects belong in services. Keep component-only props and implementation-private types beside their owners; a central types folder is not a reason to move every local interface.


### Concurrent bunker restore

Session prewarm and relay authentication share one pending bunker reconstruction per session generation. A refresh therefore performs one `get_public_key` warmup for a restored remote signer (QR or bunker URL) even when multiple relay AUTH requests arrive concurrently. The returned identity must match the persisted account before the signer becomes ready. A failed attempt releases the pending operation for retry; logout or account replacement supersedes it, and an old completion cannot clear a newer attempt. Established signer operations retain bounded concurrency.

## Extension account changes and startup verification

Only an active NIP-07 session reacts to `nostr:accountChanged`. The event payload is a hint, not identity evidence: the bridge asks the extension for its public key, validates it, and applies a changed account through the existing login lifecycle. Event bursts share one verification flow with a trailing lookup when a response has been superseded. Bunker, local-key and logged-out sessions ignore extension account events.

An account-change signal immediately suspends extension capabilities. Queued work and late results carry a session/extension-revision guard; verification cannot revive an old signer adapter, even when the selected key is unchanged. The session provider projects this pending state into `signerReady` and invalidates its cached adapter. If verification fails, signing stays suspended and the UI explains how to unlock/select the extension account again or log in again. The application never adopts an event payload as an account or silently uses a different provider.

Reload checks the selected extension key before installing a saved NIP-07 identity or opening authenticated relay traffic. It observes account events during that first lookup as well. If the key changed while the page was closed, the verified key replaces the saved public identity. A missing/locked extension leaves the saved record intact for retry but does not authenticate its stale account. A first visit with no saved session does not probe an installed extension or sign the visitor in implicitly; the login widget verifies the chosen signer when the visitor selects a login method.

Each successful login or restore refreshes the current user's profile from the lookup relays, even when the persisted profile lookup timestamp is recent. Cached metadata still supports immediate display; newer kind-0 events update the shared session profile. Ordinary relay switches retain the profile lookup cooldown.

## Provider selection for account services

Account services capture the active bridge/session capability rather than selecting a provider because a browser global happens to exist. Nostr Connect signing and NIP-04/NIP-44 operations stay on the remote signer; remote errors never fall back to `window.nostr`. Extension-only WoT calls and PQ capability discovery require the active extension session. Pending account verification and session replacement invalidate retained service capabilities.

Wallet identity is separate from Nostr signing. The active account's configured NWC wallet takes priority for any login method. Automatic WebLN fallback is available only for an extension-backed Nostr session; Nostr Connect and local-key sessions do not silently enable or pay through an unrelated browser wallet. WebLN can still represent a different wallet account from the Nostr key: this policy controls provider selection, not a claim that the two identities are cryptographically bound.
