# Obelisk Documentation

Detailed specs, plans and references for Obelisk subsystems. Start with [../AGENTS.md](../AGENTS.md) for the architecture and the rules; the roadmap is [../ROADMAP.md](../ROADMAP.md). Dated design specs and implementation plans live under `superpowers/` and are historical.

## Architecture & platform

- [data-system.md](data-system.md) - priority tiers (P0/P1/P2/P3), login → connect contract, whitelist preflight, connection banner, bridgeCache, NIP-42 AUTH, watchdog tunables, UI loading states, local data (the inventory, Settings > Data on this device, the write fence).
- [read-state.md](read-state.md) - per-channel and per-DM cursors, mention/reply detection, MentionNavigator, encrypted multi-device sync via NIP-59 gift wrap, deferred-mount gating for relay-sync subs.
- [i18n.md](i18n.md) - the three languages: URL locales, message modules and route scopes, `errorText`, the hardcoded-string ratchet, adding a language.
- [direct-messages.md](direct-messages.md) - where the DM code is, NIP-17 by default and NIP-04 per thread, the inbox ladder, encrypted uploads.
- [dm-metadata-privacy.md](dm-metadata-privacy.md) - what gift-wrapped DMs still leak, the relay ladder, AUTH modes, the rules for changing DM routing.
- [voice/](voice/README.md) - mesh voice and DM calls. Start with `voice/README.md`; deeper material in [voice/mesh-protocol.md](voice/mesh-protocol.md), [voice/mesh-modules.md](voice/mesh-modules.md), [voice/failure-modes.md](voice/failure-modes.md), [voice/dm-calls.md](voice/dm-calls.md) and [voice/testing.md](voice/testing.md).
- [sfu-system.md](sfu-system.md) - SFU engine (mediasoup, Nostr-RPC signaling). Server lives in the [obelisk-app/obelisk-sfu](https://github.com/obelisk-app/obelisk-sfu) repo. Server-side issues: [sfu-known-bugs.md](sfu-known-bugs.md).
- [social-feeds.md](social-feeds.md) - the ordinary-Nostr surface (notes, profiles, reposts, zaps) on its own relay tier.
- [relay-layout-and-branding.md](relay-layout-and-branding.md) - operator-controlled categories, channel order, and relay branding (NIP-78 kind 30078).
- [relay-roles.md](relay-roles.md) - operator-defined tiered roles and the badge shown next to member names (NIP-78 kind 30078).
- [media-packs.md](media-packs.md) - unified emoji/GIF/sticker marketplace, user packs and favorites, server favorites, NIP-51/NIP-30 events, and lossless migration.
- [server-banner.md](server-banner.md) - relay-level banner image.
- [uploads.md](uploads.md) - Blossom storage, URL format, and voice-note event contract.
- [chat-composer-attachments.md](chat-composer-attachments.md) - image and video attachments in the channel composer, and the gallery that renders them.
- [search.md](search.md) - NIP-50 search (`bridge.searchMessages`) and query syntax.
- [bitcoin-zaps-nwc.md](bitcoin-zaps-nwc.md) - the one wallet path (a connected Nostr Wallet Connect wallet, else WebLN), zaps, and paying invoices posted in chat.
- [games.md](games.md) - games on the relay (kind 2390, deterministic replay); moving to obelisk-apps.
- [mobile-navigation.md](mobile-navigation.md) - the phone shell's history-driven screen state machine.
- [onboarding.md](onboarding.md) - the discovery hints new accounts see.

## Operations

- [cloudflare-tunnel.md](cloudflare-tunnel.md) - `npm run dev:raise` exposes localhost via a named Cloudflare tunnel for phone testing of NIP-07 / NIP-46.
- [nostr-wot-sdk-fork.md](nostr-wot-sdk-fork.md) - working on `@nostr-wot/ui` from a local clone of the SDK fork.
- [qa/voice-relay-quota-regression.md](qa/voice-relay-quota-regression.md) - QA script for relay subscription quota and voice headroom (written before the relay hub).
- [screenshots/](screenshots/README.md) - older marketing screenshots, not used by the app or the README.

## Plans & proposals

- [known-bugs.md](known-bugs.md) - open bugs and tech debt.
- [wot-and-invite-credits.md](wot-and-invite-credits.md) - Web-of-Trust auto-registration design.
- [tor-desktop-node.md](tor-desktop-node.md) - one desktop app that is both client and optional server, over Tor.
- [wot-integration-plan.md](wot-integration-plan.md) - the Web-of-Trust ingest gate and mute revision (historical; implemented in `src/services/wot/`).
- [i18n-plan.md](i18n-plan.md) - the first translation plan (superseded by [i18n.md](i18n.md)).
- [content-migration-plan.md](content-migration-plan.md) - pinned messages and editable channel content (written for the classic stack).

## References

- [discord-emoji-export.md](discord-emoji-export.md) - procedure for exporting a Discord emoji set into Obelisk's emoji format.
