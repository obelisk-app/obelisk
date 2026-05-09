# Obelisk Documentation

Detailed specs, plans and references for Obelisk subsystems. High-level roadmap lives in [../ROADMAP.md](../ROADMAP.md); architecture overview in [../CLAUDE.md](../CLAUDE.md).

## Architecture & platform

- [auth-and-data-loading.md](auth-and-data-loading.md) — login flow, NIP-42 AUTH, watchdog, bridgeCache.
- [progressive-loading.md](progressive-loading.md) — sidebar-first load order, lazy admin/member, bounded message backfill, "Load earlier" pagination.
- [voice/](voice/README.md) — mesh voice subsystem. Start with `voice/README.md`; deeper material in [voice/mesh-protocol.md](voice/mesh-protocol.md), [voice/mesh-modules.md](voice/mesh-modules.md), [voice/failure-modes.md](voice/failure-modes.md), [voice/testing.md](voice/testing.md), and the diagnostic at [voice/diagnosis-2026-05-09.md](voice/diagnosis-2026-05-09.md).
- [sfu-system.md](sfu-system.md) — SFU engine (mediasoup, Nostr-RPC signaling). Server lives in the [obelisk-app/obelisk-sfu](https://github.com/obelisk-app/obelisk-sfu) repo.
- [direct-messages.md](direct-messages.md) — NIP-04 DMs.
- [relay-layout-and-branding.md](relay-layout-and-branding.md) — operator-controlled categories, channel order, and relay branding (NIP-78 kind 30078, multi-author latest-wins).
- [server-banner.md](server-banner.md) — relay-level banner image.
- [uploads.md](uploads.md) — Blossom storage + URL format.
- [search.md](search.md) — NIP-50 search (`bridge.searchMessages`) and query syntax.
- [bitcoin-zaps-nwc.md](bitcoin-zaps-nwc.md) — NWC wallet connection + zap flow.

## Operations

- [cloudflare-tunnel.md](cloudflare-tunnel.md) — `npm run dev:raise` exposes localhost via a named Cloudflare tunnel for phone testing of NIP-07 / NIP-46.

## Plans & proposals

- [known-bugs.md](known-bugs.md) — open bugs and tech debt.
- [i18n-plan.md](i18n-plan.md) — app-wide per-user translation.
- [content-migration-plan.md](content-migration-plan.md) — pinned messages and editable channel content.
- [wot-and-invite-credits.md](wot-and-invite-credits.md) — Web-of-Trust auto-registration design.

## References

- [discord-emoji-export.md](discord-emoji-export.md) — procedure for exporting a Discord emoji set into Obelisk's emoji format.
