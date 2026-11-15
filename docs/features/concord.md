# Concord integration

Status: implementation in progress on `feat/concord-dual-protocol`. This document describes the code present, not a claim of production readiness or complete protocol parity.

## Ownership

Each community uses either NIP-29 or Concord. There is no message bridge between them. Existing NIP-29 relay selection and admission remain unchanged. The Concord entry in the rail and add-relay surfaces opens a separate workspace mounted beneath the existing bridge provider.

`src/services/nostr-bridge/concord/` owns the lazy, per-session Concord runtime. Its public entry is `getConcordForBridge` through the bridge front door. The SDK is the MIT-licensed `@applesauce/concord` snapshot `0.1.0-dev.00ceaa38355d`, vendored as `vendor/applesauce-concord-00ceaa38355d.tgz` from the Accordion reference client's dependency. The upstream revision is `00ceaa38355d6d3cbc1f7c859c0e1d5eae71e841`. The reference application's source is not copied.

`hub-socket.ts` provides the SDK's WebSocket interface over Obelisk's RelayHub. Actual sockets belong to the hub. Concord uses a separate `concord:<pubkey>:<generation>` identity with no AUTH signer and `never-auth` policy. This deliberately does not authenticate the person's account to community relays. Relays requiring AUTH are not supported by this transport yet. NIP-77 requests receive an unsupported response so the SDK can fall back to paginated Nostr REQ.

Creation requires exactly three distinct secure WebSocket relay URLs. Defaults live in `src/constants/nostr-bridge/concord.ts`. Imported communities retain the relay set defined by their protocol state. This is a Concord-specific exception to the NIP-29 single-active-relay rule, not permission to expand existing group subscriptions.

## Storage and lifecycle

The runtime supplies encrypted SDK storage explicitly; it does not use the SDK's default localStorage persistence. IndexedDB `obelisk-concord`, object store `sealed`, holds authenticated ciphertext under an account-specific non-extractable vault key named `concord-key:<pubkey>`. Record names hash SDK keys so community identifiers are not embedded directly in cache addresses. Decrypted community state and timelines stay in runtime memory.

Rumor stores persist encrypted plane snapshots and reject growth beyond 100,000 events or 32 MiB per plane. They must fail closed rather than silently truncate authority history. Session guards reject work after account invalidation; disposal closes SDK subscriptions and removes the isolated hub identity. This storage is listed in the local-data inventory. It does not use `bridgeCache`, which stores ordinary relay-derived data in localStorage.

## Implemented surface and remaining work

The current workspace has create/join forms, channel creation and selection, text sending, reactions, deletion projection and invitation generation. Clicked Concord invitations are routed through the app fragment, held only in memory, and removed from the address bar after sign-in. English, Spanish and Portuguese strings live in each locale's `chat.concord` subtree. Forms use the shared form model and primitives.

Channel creation supports private channels and the native Publications view. Categories use the optional `custom.obelisk.category` extension; updates preserve unknown fields and guard the selected edition head against concurrent edits. Other clients may ignore this extension. Role creation and assignment use the SDK's authority checks. Invite and deletion controls are capability-aware. Private channels without a held key are disabled. The initial ban action requires completed SDK Refounding and is unavailable when private-channel readership needs review; it must not claim read-access revocation from a Banlist edit alone.

Attachments use independent AES-256-GCM keys and 16-byte nonces, carried only inside encrypted imeta. Only ciphertext goes to the existing encrypted Blossom uploader. Downloads are explicitly requested, bounded to 25 MiB plus the GCM tag, authenticated, checked against available hashes and downloaded as opaque files. Decrypted attachments are never added to a persistent cache.

Full shared-shell integration, comprehensive channel/category/publication editing, private-channel membership review and rekeying, staff reports, search, notifications, games and CORD-07 voice are not yet verified or complete. Role administration and moderation need broader browser coverage. Do not describe this implementation as full Concord parity until these paths and cross-client interoperability are tested.

## Validation and test deployment

Unit tests cover scoped identifiers, key derivation against the SDK, encrypted envelope interoperability, relay isolation, asynchronous socket replies, encrypted account storage and disposable test identities. Attachment tests reject modified ciphertext, wrong keys, incorrect hashes and unsupported algorithms. `scripts/e2e/concord/dual-protocol.spec.ts` has passed creation, clicked invitation, two-account message exchange, encrypted file upload/download and reload using fresh keys. Traces, screenshots and video are disabled because session setup contains private keys. Never commit test credentials or log invitation secrets.

Run typecheck, lint, structural guards, unit tests and the browser scenario before deployment. A visible NIP-29 shell alone does not establish NIP-29 messaging regression coverage. Live relay tests depend on relay availability and admission policy; record failures honestly.

Only deploy to the persistent `/root/obelisk-dex-test` checkout, preserving its environment files and dependency symlink. Build there and restart only PM2 `obelisk-dex-test` on port 3002. Verify `https://test.obelisk.ar` after restart. Do not use the production deploy script or create timestamped test release directories. See [operations](../operations/README.md).
