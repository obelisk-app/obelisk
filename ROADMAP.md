# Obelisk roadmap

This roadmap covers the relay-only client. It records pending work and design candidates, without assigning release dates or priority. Current behavior belongs in [architecture](docs/architecture/README.md) and [feature references](docs/features/README.md); completed migrations and the retired Postgres/Socket.io roadmap remain in Git history. Relay and SFU server work belongs in their own repositories.

## Reliability and security

- [ ] Extend the existing [end-to-end harness](scripts/e2e/README.md) with two-browser SFU coverage and same-account, multi-device voice scenarios. Mesh calls, relay rejection and read-state convergence already have dedicated specs.
- [ ] Add connection diagnostics for per-socket AUTH state, reconnect attempts and pending work, beyond the existing activity log.
- [ ] Review relay-list freshness and explicit refresh controls for changes published by other clients; preserve usable cached lists while offline.
- [ ] Evaluate a user-facing repair flow for imported NIP-65 relay URLs that the selected transport policy rejects. Shared URL validation already belongs to `@nostr-wot/relay`.
- [ ] Evaluate self-hosted or Nostr-native analytics if removing the Google Analytics CSP host allowance is desired; consent gating already exists.
- [ ] Perform a dedicated security and accessibility review against a release candidate, including rendered untrusted content, uploads, signer/account transitions and keyboard/screen-reader flows. Follow the existing [release discipline](AGENTS.md#deployment-discipline).

Open client and infrastructure issues are tracked in [known bugs](docs/operations/known-bugs.md), [SFU issues](docs/operations/sfu-known-bugs.md) and [voice release checks](docs/features/voice/testing.md#production-dependencies). Reproduce dated reports before implementing fixes.

## Moderation and community features

- [ ] Add an in-app NIP-56 reporting flow for messages and profiles, with a reason and optional text. Explain that reports are public signed events and that relay operators determine their handling.
- [ ] Explore WoT-weighted report display after reporting exists, without trusting arbitrary bulk reports from unknown identities.
- [ ] Design channel templates, announcements and role-aware navigation against the current relay protocol, rather than the removed database models.
- [ ] Review remaining admin workflows for bulk actions, permission previews and role grouping; keep client controls aligned with what the relay enforces.

## Voice and notifications

- [ ] Investigate end-to-end encryption of SFU media and channel key distribution. The existing mesh transport already uses WebRTC DTLS-SRTP.
- [ ] Explore moderated voice rooms with a raise-hand queue and speaker controls, plus text alongside voice.
- [ ] Complete service-worker notification delivery and click-to-conversation navigation where supported. Browser notifications and throttled sounds already run from the open page; there is no background Web Push service. See [notification behavior](docs/architecture/read-state.md#13-browser-notifications-and-sound).

## Personal data and media

- [ ] Synchronize private personal sticker packs across devices using an encrypted account-owned event, with migration from the current local-only store and explicit deletion semantics.
- [ ] Add conversation export in JSON or plain text.
- [ ] Define relay-aware account/content deletion semantics; local device-data removal already exists and cannot erase copies held by other relays or users.
- [ ] Evaluate PDF previews, media compression/transcoding and per-community themes as separate capabilities, without assuming a local database or media server.

## Lightning

- [ ] Support amountless invoices through wallets that accept an explicit payment amount. The current invoice action rejects them.
- [ ] Add wallet balance and transaction history where the connected wallet supports them.
- [ ] Explore receive animations, emoji zap presets, community leaderboards and zap splits.

The implemented payment path, wallet custody and double-pay protection are documented in [Bitcoin zaps and NWC](docs/features/bitcoin-zaps-nwc.md).

## Active proposals and longer-term candidates

- [Desktop Tor node](docs/proposals/tor-desktop-node.md): packaged client and optional relay hosting.
- [WoT admission and invite credits](docs/proposals/wot-and-invite-credits.md): server admission design, separate from existing client-side filtering.
- [Voice remote signing](docs/proposals/voice-remote-signing.md): reduce signer interactions and investigate scoped session keys.
- Knowledge-base discovery: conversation grouping, moderator-reviewed summaries and semantic search.
- Bot interoperability and a simpler mobile onboarding experience, designed around relay events and current identity flows rather than a second backend.

These candidates need a concrete design and scope before implementation. Do not treat their presence here as a promise of relay support or a scheduled release.
