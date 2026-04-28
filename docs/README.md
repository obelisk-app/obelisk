# Obelisk Documentation

Detailed specs, plans and references for Obelisk subsystems. High-level roadmap lives in [../ROADMAP.md](../ROADMAP.md); architecture overview in [../CLAUDE.md](../CLAUDE.md); deploy runbook in [../DEPLOY.md](../DEPLOY.md).

Each document here is scoped: either an architectural reference, a feature guide for something already shipped, or an implementation plan for something not yet built.

## Architecture & platform

- [voice-system.md](voice-system.md) — Socket.io audio relay, `mesh` vs `sfu` modes, perfect negotiation, track types.
- [uploads.md](uploads.md) — `/uploads/<name>` storage, URL format, access model (unlisted-not-private).
- [auth-session-persistence.md](auth-session-persistence.md) — session model, token storage, expiration.
- [cloudflare-tunnel.md](cloudflare-tunnel.md) — `npm run dev:tunnel` — expose localhost:3000 via `obelisk.fabri.lat` for external testing.
- [future-decentralization.md](future-decentralization.md) — NIP-29 relay-based groups: trade-offs and migration surface.

## Features (shipped)

- [admin-cli.md](admin-cli.md) — `scripts/admin-cli` headless client, nsec / NIP-46 auth, scriptable by AI coding agents.
- [multi-server-admin.md](multi-server-admin.md) — admin panel UX and multi-server scoping.
- [wot-and-invite-credits.md](wot-and-invite-credits.md) — WoT auto-registration (shipped), invite credits (deprecated — admin-only invites now).
- [bitcoin-zaps-nwc.md](bitcoin-zaps-nwc.md) — NWC wallet connection + zap flow.
- [search.md](search.md) — Discord-style query syntax and indexing.

## Plans & proposals (not yet shipped)

- [known-bugs.md](known-bugs.md) — open bugs and tech debt.
- [i18n-plan.md](i18n-plan.md) — app-wide per-user translation (active priority).
- [content-migration-plan.md](content-migration-plan.md) — `seed.ts` → DB-editable pinned messages and forum posts (active priority).
- [forum-parity-plan.md](forum-parity-plan.md) — reuse `MessageArea` / `MessageInput` + Socket.io inside forum posts (active priority).
- [llm-knowledge-base.md](llm-knowledge-base.md) — conversation detection + thread index + Ollama topic router.

## References

- [discord-emoji-export.md](discord-emoji-export.md) — procedure for exporting a Discord emoji set into Obelisk's server emoji format.
