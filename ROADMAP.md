# Obelisk — Roadmap

Discord-like group chat where identity comes from Nostr keypairs. Built for La Crypta's **IDENTITY Hackathon** (April 2026). Architecture overview lives in [CLAUDE.md](CLAUDE.md); deploy runbook in [DEPLOY.md](DEPLOY.md); detailed specs and open bugs under [docs/](docs/README.md).

This file is the high-level roadmap — one line per initiative, grouped by phase. Implementation details, schemas, acceptance criteria and prior-art reading live in the docs. Completed work beyond the high-level bullets below lives in git history.

## 🔥 Active priorities

- [ ] **App-wide i18n + per-user language** — extend landing i18n infra to chat/admin/moderation/forum/settings/errors, IP-based default on first login, `User.language` persisted, hot-swap from /settings. See [docs/i18n-plan.md](docs/i18n-plan.md).
- [ ] **Pinned messages + DB-editable channel content (seed paridad)** — migrate `prisma/seed.ts` hardcoded content (welcome, foro índice, méritos posts, channel info) to pinned messages and forum posts editable from /admin. See [docs/content-migration-plan.md](docs/content-migration-plan.md).
- [ ] **Forum post parity with chat** — refactor forum replies to reuse `MessageArea` + `MessageInput` + Socket.io so reactions, edits, typing, pagination and mentions work inside posts. See [docs/forum-parity-plan.md](docs/forum-parity-plan.md).
- [ ] **WoT admin UI** — data layer is shipped; finish the /admin tab with referente preview, "Refrescar WoT" action, auto-authorized list and manual whitelist overrides. See [docs/wot-and-invite-credits.md](docs/wot-and-invite-credits.md).
- [ ] **Wizard de setup inicial / instance owner desde UI** — remove the `INSTANCE_OWNER_PUBKEY` env hardcode; first authenticated NIP-07 user claims instance ownership, persisted in DB. Improves self-hosting UX.
- [ ] **Fix notifications** — the read-state foundation is built (server-side `lastReadAt`, `ToastStack`, favicon badge, title counter, bech32 + reply mention detection via `extractMentionPubkeys`) but **the feature is buggy in practice**. Audit + fix before layering the Phase 4 improvements on top. Open issues in [docs/known-bugs.md](docs/known-bugs.md).

## ✅ Shipped

### Foundation
- Auth: NIP-07, nsec, NIP-46 bunker (challenge → sign → verify → session).
- Nostr profiles: DB-cached avatar / banner / bio / NIP-05, daily refresh, startup backfill, "Sincronizar desde Nostr" button, per-server nickname override.
- La Crypta design system + relay management.
- Landing page — bilingual ES/EN, responsive.

### Chat
- Schema: Server / Category / Channel / Message / Member / Ban / Mute / Warning / Report / Session.
- Real-time via Socket.io: message CRUD, reactions, threads, edits, deletes, typing, error handling, paginated history.
- Rich text: markdown, code blocks + syntax highlighting, spoilers, blockquotes, lists, OG link previews, YouTube embeds.
- Mentions (@user) resolved from Nostr profiles; profile popover on click (avatar, banner, NIP-05, roles, join date).
- Forum channels (list + detail + tags) using the shared `MessageInput`.
- Welcome channel with configurable `welcomeChannelId` + banner.
- Pinned messages (`Message.pinnedAt` + pins panel).
- Message search (Discord-style) — see [docs/search.md](docs/search.md).

### Voice
- Audio, video, screen sharing via Socket.io relay; mesh (P2P) and LiveKit SFU backends. Force disconnect. See [docs/voice-system.md](docs/voice-system.md).

### Uploads & media
- Multi-file upload (paste + drag-and-drop), dynamic image gallery, lightbox with zoom / pan, videos, audio, documents.
- Per-server configurable size limits per mime category.
- Custom emojis per server + shortcode autocomplete (`:name:`) + bilingual emoji picker.
- See [docs/uploads.md](docs/uploads.md).

### Admin & moderation
- Multi-server admin panel with server picker + CRUD of channels / categories / members / invitations. See [docs/multi-server-admin.md](docs/multi-server-admin.md).
- Instance owner (global access via `INSTANCE_OWNER_PUBKEY`, can transfer `Server.ownerPubkey`).
- Roles: owner / admin / mod / member — **plus custom roles per server** (`CustomRole` + `MemberCustomRole`, colors / icons / priority, badges).
- **Role-gated channels** (`readRoleIds` / `writeRoleIds`) and **write-locked channels** (`writePermission`: everyone / mod / admin / roles).
- Invite links: create, copy, expire, revoke, join-source tracking (`Member.joinedViaInviteId`).
- WoT auto-registration data layer: `referentePubkey` + `wotEnabled` per server, kind-3 fetch, `isInWot()` gate, `WotEntry` + `WotOverride` models.
- Bans (with required reason), mutes, warnings, reports, audit log with pagination.
- Access Control tab unifying join-mode + WoT + invitations.
- Admin CLI for AI-agent scripting — see [docs/admin-cli.md](docs/admin-cli.md).

### Lightning
- NWC wallet connection, encrypted client-side before persistence.
- Zap users from profile + zap messages with custom amounts or presets.
- See [docs/bitcoin-zaps-nwc.md](docs/bitcoin-zaps-nwc.md).

### Testing & ops
- 146+ Vitest + RTL tests across 47+ files (auth / chat / voice / DM / search / admin / moderation / i18n stores / favicon-badge / read-tracker / mention extractor).
- Docker + Caddy + PostgreSQL self-host deploy (BuildKit cache mounts, Prisma schema copied after `npm ci`).

## 📅 Upcoming

### Fase 1.5 — Admin, moderation & forums (remaining)
- [ ] **Permisos configurables por rol** — editable per-server permission matrix (invite, kick, ban, mute, manage roles, webhooks…).
- [ ] **Server-level access control by role** — private servers visible only to given roles.
- [ ] **Canal tipo `updates` / announcements** — new `Channel.type = 'updates'`; admin-only posts, push notification, pinned in sidebar. Supersedes the older "announcement channels" bullet (it's the same feature).
- [ ] **Channel templates** — Community / Gaming / DAO / Dev-Team presets, custom templates, apply-to-existing server.
- [ ] **Dashboard de estadísticas** — `/admin/stats` for instance owner: storage breakdown, DAU / WAU / MAU, top posters, top channels, DB table sizes; CSV / JSON export.
- [ ] **Moderation panel, multi-server** — scope by server; mods only see / act on servers where they have permissions.
- [ ] **Admin UX polish** — drag-and-drop reorder, inline edit, bulk actions, role-visibility preview, permission-matrix grid.
- [ ] **Member list grouped by role** — sidebar sections by role ordered by `priority`, online counts, offline section collapsible.
- [ ] **`Channel.purpose` enum** — `onboarding | rules | announcements | merit_claim | normal` for purpose-specific widgets (see content-migration-plan).

### Fase 2 — Core features
- [ ] **DMs over Nostr (NIP-17 + legacy NIP-04)** — architecture is built (schema, signer integration, lazy relay-AUTH, rumor fields) but **not shipped**: gated by `DM_FEATURE_ENABLED` in `src/lib/feature-flags.ts` pending NIP-17 signer-lifecycle fixes.
- [ ] **Multi-server onboarding** — screen for users with no servers: join via invite, browse public servers, create new. Creation by any authenticated user (today instance-owner only).
- [ ] **DMs 1-a-1 server-scoped (alternative path)** — if the NIP-17 direction hits a dead end: `DirectConversation` + `DirectMessage` models, REST + `dm:<id>` Socket rooms, inbox in ServerBar, anti-spam via shared-server constraint.
- [ ] **Llamadas directas 1-a-1** — audio / video P2P with signaling via Socket.io.
- [ ] **Voice — text chat within a voice channel**.
- [ ] **Voice — E2EE over SFU** — LiveKit insertable streams, WebCrypto frame encryption, passphrase or NIP-44 key exchange per channel.
- [ ] **Voice — town hall / moderated mode** — raise-hand queue, grant / revoke speak, concurrent-speakers cap.
- [ ] **Relative links `#{nombre}`** — channel / post / thread autocomplete mirroring mentions; stable placeholders, permission-gated, rename-safe.
- [ ] **Idioma canónico del servidor** — `Server.language` for system messages (independent of per-user UI language).
- [ ] **User-personalised channel view** — sidebar sorted by `lastInteractionAt` + per-user pins + "show all channels" toggle.
- [ ] **Account and data deletion** — settings action, cascade or tombstone user's messages, membership and moderation records.

### Fase 3 — Advanced features
- [ ] **Mute / Block sync via NIP-51 (kind 10000)** — today mute / block is client-side in `localStorage` (`src/store/moderation.ts`); sync via relays with NIP-44 encryption, import existing mute lists from other clients.
- [ ] **Nostr relay-based groups (NIP-29 exploration)** — map current model against NIP-29 kinds, decide own-relay vs external. See [docs/future-decentralization.md](docs/future-decentralization.md).
- [ ] **App profiles + Nostr kind-0 editor** — overlay over Nostr, plus a safe kind-0 editor with read → merge → diff preview → confirm → publish.
- [ ] **Export conversations** (JSON / plain text).
- [ ] **Discord-compatible bot API** — subset of REST v10 + Gateway WebSocket + `BotAccount` + snowflake-style ID translation.
- [ ] **Stickers per server** — `ServerSticker` model + `StickerPicker` + admin tab.
- [ ] **PDF thumbnails** — deferred, needs `pdfjs-dist` + native canvas in the Docker image.
- [ ] **Compression / transcoding** — deferred, needs `sharp` for images and `ffmpeg-static` for video.

### Fase 4 — Polish & launch
- [ ] **Notifications (remaining phases)** — per-channel settings (All / Mentions-only / Nothing) persisted in `MemberChannelSettings`, server / channel mute durations, browser Notification API when backgrounded, fix `/api/unread` DM count (today it's binary per thread), jump-between-mentions (F7 / Shift+F7).
- [ ] **PWA** — installable, offline, service worker.
- [ ] **Per-server custom themes**.
- [ ] **Mobile responsive audit** — chat / admin / moderation / voice / forum views.

### Fase 5 — Knowledge base with LLM
Full design: [docs/llm-knowledge-base.md](docs/llm-knowledge-base.md).
- [ ] Conversation detector + topic-routing suggestion card (inline, dismissible, cooldown per channel).
- [ ] Thread index — LLM-generated descriptions via Ollama `llama3.2:1b`, mod approval gate.
- [ ] Semantic search over the indexed knowledge base + auto-tagging.

### Fase 6 — Lightning zaps (remaining)
- [ ] Balance in UI + transaction history.
- [ ] Zap with attached message + receive animation.
- [ ] Emoji zaps (⚡=21, 🔥=100, 🚀=500, 💎=1000 sats) + per-channel / per-server leaderboards.
- [ ] NIP-57 zap receipts + zap splits.

### Fase 7 — Obelisk Lite
A zero-learning-curve mobile / web client, intercompatible with Obelisk full (same backend, same API, same DB).
- [ ] React Native / PWA mobile + responsive web.
- [ ] WhatsApp-like onboarding over NIP-07 / nsec / bunker, no Nostr jargon exposed to the user.
- [ ] Channels rendered as "grupos", threads inline, push notifications, QR / link invites.

### Fase 8 — Security audit & code quality
Pre-hackathon hardening. Expand into `docs/security-audit-plan.md` when the work starts.
- [ ] **Frontend security** — XSS audit (markdown, bios, channel names), content sanitization, CSRF / session hijacking review, upload validation (type / size / path / SVG), auth bypass, WebSocket spoofing, rate limiting, `npm audit` + deps review, CSP + HSTS + security headers, manual pentest against staging (OWASP Top 10 for chat apps).
- [ ] **Code quality** — shared UI primitives (Button / Modal / Dialog / Input / Dropdown / Avatar / Tooltip / Badge / Tabs), unified confirm-dialog, reusable hooks (`useSocket`, `usePermission`, `useServerRole`, `usePagination`, `useDebounce`), unified fetch helper, strict TypeScript (`noUncheckedIndexedAccess`), ESLint + Prettier + husky + lint-staged, a11y (ARIA, keyboard nav, contrast, screen readers).
- [ ] **Performance** — lazy routes via `next/dynamic`, virtualization for messages / members / channels, bundle analysis, image optim, DB indexes + N+1 review, cursor-based pagination, debounce / throttle, `React.memo` / `useMemo`, `perMessageDeflate`, profile prefetch, service worker.
- [ ] **Documentation** — `docs/security.md`, `docs/components.md`, `docs/architecture.md`, `CONTRIBUTING.md`, TSDoc on public APIs.

## 🐛 Known bugs & tech debt

See [docs/known-bugs.md](docs/known-bugs.md).

## 🧪 Test suite

Vitest + React Testing Library, 47+ files / 146+ tests. Covered: auth, channels, messages, DMs, members, search, voice, admin, moderation, i18n, stores, favicon-badge, read-tracker, mention extractor. Pending: multimedia upload tests, WebSocket reconnection + multi-client tests, Playwright E2E flows, load tests, CI pipeline running tests on every PR.

## ⛔ Descoped

- ~~**Activity-based invite credits**~~ — replaced by admin-only invites (Discord model). The UI form in `AccessPanel`, the `/api/servers/:id/invite-credits` endpoint, `lib/invite-credits.ts`, the `InviteCreditsCard` profile widget, and the enforcement in `POST /api/servers/:id/invitations` were all removed. The `minDaysActive`, `minMessages`, `invitesPerUser`, `inviteExpiryHours` columns on `Server` are kept to preserve data but are no longer read or written.
- ~~**Vercel + Neon deployment**~~ — replaced by self-hosted Docker + Caddy + PostgreSQL. See [DEPLOY.md](DEPLOY.md).
- ~~**Socket.io relocation (Railway / Fly.io / Pusher)**~~ — no longer needed; Socket.io runs inside the custom `server.ts` and ships with the Docker image.
