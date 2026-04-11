# AGENTS.md — Obelisk

You are building **Obelisk**, a Discord-like group chat app where identity comes from Nostr keypairs. No emails, no passwords — cryptographic identity only.

Built for La Crypta's **IDENTITY Hackathon** (April 2026). See [ROADMAP.md](ROADMAP.md) for the full development plan.

## Architecture

Nostr handles **identity & auth** (keys, profiles, NIP-05, signing). The server handles **everything else** (channels, messages, members, roles, permissions, real-time delivery).

```
Frontend          Next.js + Tailwind (La Crypta UI)
Auth              Nostr (NIP-07 / nsec / NIP-46 bunker)
Backend           Next.js API Routes + custom server (server.ts)
Database          PostgreSQL (self-hosted via Docker)
ORM               Prisma 7 + @prisma/adapter-pg
Real-time         Socket.io (via server.ts)
Voice             WebSocket audio relay (via server.ts + Socket.io)
```

## Stack
- **Next.js 16** + TypeScript + Tailwind CSS v4
- **NDK** (Nostr Dev Kit v3) — Nostr abstraction for auth & profiles
- **Prisma 7** — ORM with PostgreSQL via `@prisma/adapter-pg`
- **Socket.io** — Real-time messaging (via `server.ts`)
- **WebSocket Audio** — Voice channels via Socket.io audio relay (works through tunnels/proxies, see `docs/voice-system.md`)
- **Zustand** — client-side state management
- **nostr-tools** — low-level Nostr utilities
- **Vitest** + **React Testing Library** — testing

## Project Structure
```
prisma/
├── schema.prisma         # Data model (Server, Channel, Message, Member, etc.)
├── seed.ts               # DB seed script
└── migrations/           # Prisma migrations
server.ts                 # Custom Next.js + Socket.io server
src/
├── app/
│   ├── layout.tsx        # Root layout (La Crypta theme)
│   ├── page.tsx          # Landing / main page
│   ├── chat/page.tsx     # Chat UI (Discord-like layout)
│   ├── admin/page.tsx    # Server administration panel
│   ├── moderation/page.tsx # Moderation dashboard
│   └── api/
│       ├── auth/         # challenge → sign → verify → session
│       ├── channels/     # CRUD channels + messages
│       ├── members/      # Member management
│       ├── admin/        # Server settings, roles, bans, kicks
│       └── moderation/   # Reports, mutes, warnings, mod log
├── components/
│   ├── Navbar.tsx        # Top navigation + user menu
│   ├── LoginModal.tsx    # 3 auth methods + QR bunker flow
│   ├── ObeliskIcon.tsx   # App icon
│   ├── chat/
│   │   ├── ServerBar.tsx     # Server icon sidebar (Discord-like)
│   │   ├── ChannelSidebar.tsx # Channel list sidebar
│   │   ├── MessageArea.tsx    # Message display with scroll
│   │   └── MessageInput.tsx   # Message composer
│   ├── admin/
│   │   ├── MemberRow.tsx     # Member list row with actions
│   │   ├── ConfirmDialog.tsx # Confirmation modal
│   │   └── RoleBadge.tsx     # Role display badge
│   └── moderation/
│       └── ModActionCard.tsx # Moderation action display
├── lib/
│   ├── nostr.ts          # NDK setup, login, relay mgmt
│   ├── auth.ts           # Client-side auth (challenge/verify flow)
│   ├── api-auth.ts       # API route auth helpers
│   ├── backend-auth.ts   # Server-side session verification
│   ├── auth-roles.ts     # Role & permission logic
│   ├── db.ts             # Prisma client singleton
│   └── db-server.ts      # Server initialization helpers
├── store/
│   ├── auth.ts           # Auth state (Zustand + localStorage)
│   ├── chat.ts           # Chat state (channels, messages, socket)
│   └── nav.ts            # Navigation state
├── generated/prisma/     # Generated Prisma client
└── test/
    ├── setup.ts          # Vitest setup
    └── mocks/ndk.ts      # NDK mock for tests
```

## Commands
```bash
npm install          # Install dependencies
npm run dev          # Dev server (Next.js + Socket.io) at localhost:3000
npm run build        # prisma generate + migrate deploy + next build
npm run test         # Run all tests once
npm run test:watch   # Run tests in watch mode
npm run test:coverage # Run tests with coverage report
npx prisma migrate dev  # Run database migrations (dev)
npx prisma db seed      # Seed the database
```

## Deployment (Self-Hosted Docker)

See [DEPLOY.md](DEPLOY.md) for full setup instructions.

### Infrastructure
```
Internet → Caddy (:443 HTTPS + auto SSL) → Obelisk (:3000 Next.js + Socket.io) → PostgreSQL (:5432)
```
- **Hosting:** Self-hosted via Docker Compose (VPS with 2GB+ RAM)
- **Database:** PostgreSQL (Docker container)
- **Real-time:** Socket.io via `server.ts` (persistent WebSocket connections)
- **SSL:** Caddy with automatic Let's Encrypt certificates
- **Build caching:** Dockerfile uses BuildKit cache mounts for npm; Prisma schema is copied after `npm ci` so dependency cache survives schema changes

### Environment Variables
- `DOMAIN` — your domain name
- `POSTGRES_PASSWORD` — database password
- `DATABASE_URL` — PostgreSQL connection string (composed from above)

### All features work in self-hosted mode
Auth, channels, messages, real-time delivery, typing indicators, reactions, voice channels, force disconnect, admin, moderation, forum posts.

## Auth Flow
1. Client requests login (NIP-07 extension, nsec, or NIP-46 bunker)
2. Server generates challenge (random string + timestamp)
3. Client signs challenge with Nostr key
4. Server verifies signature against pubkey
5. Server creates session in DB, returns session token
6. All API requests include session token for auth

## Data Model (Prisma)
```
Server        — id, name, icon, ownerPubkey, joinMode
Channel       — id, serverId, name, type, position, categoryId
Category      — id, serverId, name, position
Message       — id, channelId, authorPubkey, content, replyToId
Member        — id, serverId, pubkey, role, displayName, avatarUrl
Session       — id, pubkey, token, expiresAt
Ban           — id, serverId, pubkey, reason, bannedBy
Mute          — id, serverId, pubkey, mutedBy, expiresAt
Report        — id, serverId, reporterPubkey, targetPubkey, reason, status
Warning       — id, serverId, pubkey, reason, issuedBy
ModerationAction — id, serverId, action, targetPubkey, performedBy, reason
```

## Design System (La Crypta)
- **Background:** `lc-black` (#0a0a0a) with subtle grid pattern
- **Cards:** `lc-dark` (#171717) with `lc-border` (#262626), 12px radius
- **Accent:** `lc-green` (#b4f953) — lime green for active states, CTAs
- **Text:** `lc-white` (#fafafa), `lc-muted` (#a3a3a3)
- **Buttons:** Pill-shaped (9999px radius) — `lc-pill-primary` / `lc-pill-secondary`
- **CSS classes:** `lc-card`, `lc-glow`, `lc-spinner`, `lc-skeleton`, `lc-img-skeleton`

## Key NIPs Used

| NIP | What | Usage |
|-----|------|-------|
| NIP-01 | Basic events & profiles | Profile data (kind 0) |
| NIP-07 | Browser extension signer | Login method |
| NIP-46 | Nostr Connect (bunker) | Login method with QR |
| NIP-05 | DNS-based verification | Display verification status |
| NIP-65 | Relay list metadata | Auto-fetch user relays |

## Development Guidelines

### When coding:
- Use NDK for all Nostr operations (`getNDK()` singleton, `connectNDK()` to ensure connection)
- All fetch operations should have timeouts (use `withTimeout` pattern from nostr.ts)
- Follow La Crypta design system — use `lc-*` CSS classes and color tokens
- Add skeleton loading for any new data-fetching component
- **Real-time data parity:** When creating Prisma records emitted via Socket.io, always `include` the same relations that the GET endpoint returns. Otherwise real-time updates will be missing nested data and only show correctly after a page refresh.
- **Always write tests** for new features (see Testing section)

### NDK Quick Reference:
```typescript
import NDK, { NDKEvent, NDKUser } from '@nostr-dev-kit/ndk';
import { getNDK, connectNDK } from '@/lib/nostr';

const ndk = getNDK();
const event = new NDKEvent(ndk);
event.kind = 1;
event.content = "Hello Nostr!";
await event.publish();

const user = ndk.getUser({ pubkey });
await user.fetchProfile();
```

## Testing

### Stack
- **Vitest** — test runner (configured in `vitest.config.ts`)
- **React Testing Library** — component testing
- **jsdom** — browser environment simulation

### Conventions
- Co-locate test files next to source: `Component.tsx` -> `Component.test.tsx`
- Shared mocks in `src/test/`
- Use `data-testid` attributes for reliable test selectors

### What to test
- **Components:** rendering, skeleton states, interactions, conditional rendering
- **Stores (Zustand):** initial state, actions, persistence
- **API routes:** request/response, auth, error cases
- **Lib functions:** pure functions, async with timeouts, error handling

> **CRITICAL — NON-NEGOTIABLE RULE:**
> A feature is **NOT done** until its tests are written, passing, and the full suite runs green.
> Do NOT move on to the next task until `npm run test` passes with the new tests included.
> **No exceptions. Tests are part of the implementation, not an afterthought.**

## Relays
- **Default:** relay.damus.io, relay.nostr.band, nos.lol, relay.primal.net, purplepag.es
- **User relays:** Auto-fetched from NIP-65 (kind 10002)

## Resources
- [NDK Documentation](https://ndk.fyi)
- [Nostr Protocol](https://nostr.com)
- [NIPs Repository](https://github.com/nostr-protocol/nips)
- [La Crypta](https://lacrypta.ar)
- [ROADMAP.md](ROADMAP.md) — Development roadmap
- [docs/wot-and-invite-credits.md](docs/wot-and-invite-credits.md) — WoT auto-registration + activity-based invite credits (anti-spam core)
