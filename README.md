<p align="center">
  <img src="public/obelisk-md.gif" alt="Obelisk" width="50%" style="max-height: 320px; object-fit: cover;" />
</p>

<h1 align="center">Obelisk</h1>

<p align="center">
  <b>The Discord alternative with Nostr login.</b><br/>
  Group chat for crypto and privacy folks — no email, no password, no phone number, just your Nostr keys.
</p>

<p align="center">
  <a href="https://obelisk.ar">Live app</a> ·
  <a href="ROADMAP.md">Roadmap</a> ·
  <a href="docs/">Docs</a>
</p>

<p align="center">
  <a href="https://github.com/Fabricio333/obelisk/stargazers"><img src="https://img.shields.io/github/stars/Fabricio333/obelisk?style=flat&logo=github&color=b4f953&labelColor=0a0a0a" alt="GitHub stars" /></a>
  <a href="https://obelisk.ar"><img src="https://img.shields.io/badge/chat-obelisk.ar-b4f953?style=flat&labelColor=0a0a0a" alt="Join the Obelisk server" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Fabricio333/obelisk?style=flat&color=b4f953&labelColor=0a0a0a" alt="License" /></a>
</p>

---

Obelisk feels like Discord — servers, channels, voice rooms, reactions, DMs — but your account is a **cryptographic key you own**, not an email on a corporate server. This repo (`obelisk-dex`) is the **fully Nostr-relay-only** rewrite: no backend, no database, no API routes.

## Why

Discord-style chat without the Discord-style data trail.

- **No personal information.** Identity is a Nostr keypair — no email, phone, name, or device fingerprint required, ever.
- **No backend to trust.** Everything is a NIP-29 / NIP-04 / NIP-17 event delivered straight from a Nostr relay to the browser. Group state, members, admins, messages, DMs, and reactions all live on relays you choose.
- **Open source and operator-controlled.** Anyone can run a relay; anyone can host the static frontend. There is no central database, no privileged API server.

Nostr provides the **identity layer** (keys, profiles, NIP-05, Web of Trust) and the **transport layer** (NIP-29 groups). Obelisk is a thin React shell on top.

## Architecture

```
Frontend          Next.js 16 + Tailwind v4 (purely client-rendered)
Auth              Nostr (NIP-07 / nsec / NIP-46 bunker)
Bridge            src/lib/nostr-bridge/ — SimplePool + nostr-tools singleton
Group protocol    NIP-29 (kinds 9, 9000-9007, 39000-39002)
DMs               NIP-04 (kind 4)
Cache             localStorage stale-while-revalidate
Voice             P2P over Nostr signaling
Payments          Nostr Wallet Connect (NIP-47)
```

There is **no** Postgres, **no** Prisma, **no** Socket.io server, **no** `/api/*` routes. The whole app is a static Next.js build that talks to relays directly.

## Adoption

Obelisk is already in real-world use:

- **75+ users** on the public global server at [obelisk.ar](https://obelisk.ar).
- **20+ users** migrated from La Crypta's official Discord to the La Crypta server on Obelisk.

## Features

- 🔑 **Nostr login** — NIP-07 extension (auto-hidden if not installed), nsec string, or NIP-46 bunker (QR). No signup forms, ever.
- 💬 **Real-time chat** — groups, channels, reactions, mentions, search (NIP-50), all over NIP-29.
- 🎙️ **Voice channels** — P2P audio with Nostr-based signaling (no media server).
- 🔒 **Encrypted DMs** — NIP-04 direct messages, with NIP-65 relay-list resolution for delivery.
- ⚡ **Bitcoin zaps** — send sats in chat via Nostr Wallet Connect (NIP-47). The wallet connection string stays client-side.
- 🎨 **Operator-controlled branding & layout** — relay operators set channel categories, ordering, and branding via NIP-78 (kind 30078).
- 🖼️ **Blossom uploads** — image attachments via Blossom (BUD-01) with NIP-98 HTTP auth.
- 🏠 **Trivially self-hostable** — static export; deploy to any CDN. Bring your own relay.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 16 + TypeScript + Tailwind CSS v4 |
| Auth / Identity | Nostr (`nostr-tools` `SimplePool`, `BunkerSigner`) |
| Bridge | `src/lib/nostr-bridge/` — singleton pool + React hooks |
| State | Zustand (UI state only — identity comes from the bridge) |
| Cache | localStorage stale-while-revalidate |
| Payments | Nostr Wallet Connect (NIP-47) |
| Testing | Vitest + React Testing Library + jsdom |
| Deploy | Static Next.js build behind any CDN / Cloudflare tunnel |

## Quick Start (dev)

```bash
git clone https://github.com/Fabricio333/obelisk.git
cd obelisk-dex
npm install
npm run dev                     # Next.js at :3000
```

Open [http://localhost:3000](http://localhost:3000). No database, no migrations, no env file required for basic dev.

### Expose dev server over HTTPS (for NIP-07 / mobile testing)

```bash
npm run dev:raise               # dev server + Cloudflare tunnel
```

Requires a Cloudflare tunnel of your own. Create one with `cloudflared tunnel create <name>` and `cloudflared tunnel route dns <name> <your.host>`, then set `TUNNEL_NAME` and `TUNNEL_HOSTNAME` in `.env` (see [docs/cloudflare-tunnel.md](docs/cloudflare-tunnel.md)).

## Self-Hosting

Because there is no backend, hosting is just serving the static Next.js build. Any CDN works (Vercel, Cloudflare Pages, Netlify, your own nginx). Point users at your relay of choice — the default is `wss://relay.obelisk.ar`, overridable per session.

## Auth Flow

Entirely client-side — there is no server to challenge.

1. User picks a method: NIP-07 extension, nsec, or NIP-46 bunker.
2. The bridge stores the session in `localStorage` and opens a fresh `SimplePool`.
3. `connect()` performs the relay handshake; relays that require NIP-42 AUTH renegotiate via the bridge's `automaticallyAuth` callback.
4. Global REQs are opened (group metadata kind 39000, incoming DMs kind 4, contact list kind 3, own kind 0).
5. `isLoggedIn` flips true; `AppShell` mounts the chat UI.

See [docs/auth-and-data-loading.md](docs/auth-and-data-loading.md) for the full contract.

## Data Model

There are no tables. Group state is reconstructed from Nostr events, newest-`created_at`-wins:

| What | Kind | Source |
|------|------|--------|
| Profile | 0 | Profile relays (damus, nostr.band, primal, …) |
| Contact list | 3 | Profile relays |
| DM | 4 | NIP-04 (encrypted) |
| Group message | 9 | NIP-29 group relay |
| Group admin actions | 9000–9007 | NIP-29 group relay |
| Group metadata | 39000 | NIP-29 group relay |
| Group admins | 39001 | NIP-29 group relay |
| Group members | 39002 | NIP-29 group relay |
| Channel layout / branding | 30078 | NIP-78 application data |
| User relay list | 10002 | NIP-65 |

## NIPs Used

| NIP | What | Where |
|-----|------|-------|
| NIP-01 | Events & profiles | Profile data (kind 0) |
| NIP-04 | Direct messages | DMs (kind 4) |
| NIP-05 | DNS verification | Display verification badge |
| NIP-07 | Browser extension signer | Login (auto-detected) |
| NIP-29 | Simple groups | Channels (kinds 9, 9000-9007, 39000-39002) |
| NIP-42 | Client auth to relays | Auto-auth via `automaticallyAuth` callback |
| NIP-46 | Nostr Connect (bunker) | Login via bunker URL or QR |
| NIP-47 | Nostr Wallet Connect | In-chat Bitcoin zaps |
| NIP-50 | Search | Message search |
| NIP-65 | Relay list metadata | Auto-fetch user relays for DM delivery |
| NIP-78 | Application-specific data | Channel layout & relay branding (kind 30078) |
| NIP-98 | HTTP authentication | Blossom upload-auth |

## Scripts

```bash
npm run dev               # dev server (Next.js)
npm run dev:raise         # dev server + Cloudflare tunnel
npm run raise             # production deploy
npm run build             # next build
npm run start             # next start
npm run test              # vitest run
npm run test:watch        # vitest watch
npm run test:coverage     # vitest + coverage report
```

## Testing

Vitest + RTL, co-located `Component.test.tsx` files next to sources. Bridge integration tests use a `FakePool` that mocks `SimplePool` (see `src/lib/nostr-bridge/bridge.test.ts`).

> **A feature is not done until its tests are written, passing, and the full suite runs green.**

## Contributing

Issues and PRs welcome. Before submitting:

1. Run `npm run test` — everything must pass.
2. Follow the La Crypta design system (`lc-*` CSS classes, `lc-green` accent).
3. Identity always comes from the bridge (`useIsLoggedIn`, `useMyPubkey`, …) — do not introduce a new auth store or backend session.

See [CLAUDE.md](CLAUDE.md) for detailed architecture & conventions.

## Roadmap

See [ROADMAP.md](ROADMAP.md). This repo (`obelisk-dex`) is the relay-only rewrite of the original `obelisk` app — the legacy Postgres/Socket.io stack lives in the sibling `obelisk` directory and is being phased out as parity is reached here.

## Resources

- [Nostr Protocol](https://nostr.com) · [NIPs](https://github.com/nostr-protocol/nips) · [La Crypta](https://lacrypta.ar)
- Docs: [auth & data loading](docs/auth-and-data-loading.md) · [voice system](docs/voice-system.md) · [relay layout & branding](docs/relay-layout-and-branding.md) · [uploads](docs/uploads.md) · [Cloudflare tunnel](docs/cloudflare-tunnel.md) · [known bugs](docs/known-bugs.md)
