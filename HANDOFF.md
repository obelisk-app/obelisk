# obeliskord — handoff

Merger of obelisk's UI with nostrord's Nostr logic. **Phase A complete and runnable.**

## What works today

```bash
cd /Volumes/Ext\ Disk/WebstormProjects/obeliskord
npm run dev     # → http://localhost:3000 (or PORT=3500 npm run dev)
```

- **`/`** — obelisk landing page, verbatim. `HTTP 200, 86 KB`.
- **`/app`** — minimal end-to-end Nostr client styled with obelisk's design tokens:
  - nsec login (paste an `nsec1…` key) or NIP-07 (browser extension)
  - Connect to a NIP-29 relay (default `wss://groups.fiatjaf.com`)
  - Live group list (kind 39000) in the sidebar
  - Per-group chat (kind 9): receive + send
  - Switch relay inline; logout clears localStorage

Files in this slice:
- `src/app/app/page.tsx` and `src/app/app/AppShell.tsx` — login + sidebar + chat
- `src/lib/nostr-bridge/` — bridge facade
  - `client.ts` — backed by `nostr-tools` (SimplePool, finalizeEvent, nip19)
  - `types.ts` / `actions.ts` / `stores.ts` / `index.ts`

## Architectural decision

**The originally planned KMP→WASM bridge was not used.** Kotlin/Wasm 2.2.20's
`@JsExport` cannot return non-`external` class types from interop functions
(compile error: *"Type 'NostrBridge' cannot be used as return type of JS
interop function. Only external, primitive, string, and function types
are supported in Kotlin/Wasm JS interop."*).

Building it would require a flat-module redesign with JSON-string returns
or `external interface` types — a multi-day rewrite. Instead, the bridge
was implemented in TypeScript using `nostr-tools`, which uses the same
crypto primitives nostrord uses (secp256k1, NIP-04, NIP-44). The protocol
behaviour is identical; only the host language differs.

The seam is preserved: components only import from `@/lib/nostr-bridge`.
A future swap to a real KMP-WASM artifact is a single-file change inside
`client.ts`.

## What was dropped from obelisk

- Backend (`prisma/`, `server/`, `src/server/`, `src/app/api/`, Docker, Caddy, `prisma.config.ts`)
- Backend deps from `package.json` (`@prisma/*`, `livekit-*`, `socket.io` server, `jsonwebtoken`, `dotenv`, `tsx`)
- `src/lib/db-server.ts`; `src/lib/db.ts` is stubbed for non-critical-path imports

`@nostr-dev-kit/ndk` and `nostr-tools` are kept transitionally so untouched
obelisk components (the existing `/chat`, `/profile`, `/admin` routes and
the original `LoginModal`) still compile. They aren't on the `/app` path
and can be removed when no consumers remain.

## Routes and what they do

| Route | Status |
|---|---|
| `/` | ✅ Landing (obelisk verbatim) |
| `/app` | ✅ **New** — login + groups + chat, driven by the bridge |
| `/chat`, `/profile`, `/guides`, `/invite/*`, `/admin/*`, `/moderation` | ⚠ Compile but won't function — they expect obelisk's backend (`/api/*`) which was removed. Either wire onto the bridge per-page or delete. |

## Future work

1. **Forum / subgroups** — extend `client.ts` with `subscribeChildrenByParent(groupId)` and a UI mapping. Maps to obelisk's `ForumView`.
2. **DMs** — NIP-04 + NIP-44 wrappers over the bridge (`nostr-tools` exports both). Maps to obelisk's `dm/` components.
3. **Bunker (NIP-46)** login — currently throws. `nostr-tools` doesn't ship NIP-46 client; either port nostrord's `Nip46Client.kt` or add a small NIP-46 implementation.
4. **Profile editing, relay list NIP-65, reactions, deletions, members/admins panels** — extend bridge surface (mirror the `NostrRepositoryApi` interface in `nostrord/.../NostrRepositoryApi.kt`).
5. **Real KMP-WASM bridge swap** — when Kotlin/Wasm `@JsExport` for class returns matures (or via the JSON-string redesign), replace `client.ts` body with the wasm import. See plan at `~/.claude/plans/parsed-petting-wolf.md`.
6. **Strip transitional NDK / nostr-tools / socket.io-client** from `package.json` once each obelisk route is rewritten or deleted.

## Tasks

| # | Status | Subject |
|---|---|---|
| 1 | done | Scaffold obeliskord/ |
| 2 | done | Copy obelisk UI |
| 3 | done | Landing renders |
| 4 | dropped | `:core` extraction (not needed under TS bridge) |
| 5 | dropped | `:webBridge` Kotlin module (replaced by TS bridge) |
| 6 | dropped | Build/package wasm artifact |
| 7 | done | TS bridge facade |
| 8 | done | Login wired (via `/app` AppShell, not obelisk's LoginModal) |
| 9 | done | Sidebar + MessageArea + MessageInput (in AppShell) |
| 10 | future | Forum + DMs |
