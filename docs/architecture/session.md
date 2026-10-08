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
