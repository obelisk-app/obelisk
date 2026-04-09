# Obelisk — Discord-like Chat with Nostr Identity

A Discord-style group chat app where your identity **is** your Nostr keypair. No emails, no passwords — just cryptographic identity.

Built for La Crypta's **IDENTITY Hackathon** (April 2026).

## Why

Nostr DMs are limited — NIP-04 leaks metadata, NIP-17 is spam-prone. Group chat over relays doesn't scale. But Nostr **identity** is solid: keys, profiles, NIP-05 verification, badges, web of trust.

Obelisk uses Nostr for what it does best (identity & auth) and a traditional server for what it needs (channels, messages, permissions, real-time delivery).

## Architecture

```
Frontend          Next.js + Tailwind (La Crypta UI)
Auth              Nostr (NIP-07 / nsec / NIP-46 bunker)
Backend           Next.js API Routes + Socket.io
Database          SQLite (dev) / PostgreSQL (prod)
ORM               Prisma
```

**Nostr handles:** Authentication (sign-in with keys), profile data (kind 0), DMs (encrypted via relays)
**Server handles:** Channels, messages, members, roles, permissions, real-time delivery

## Quick Start

```bash
git clone https://github.com/fabrica/obelisk
cd obelisk
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Features

- **Nostr login:** Extension (Alby/nos2x), nsec, or NIP-46 bunker
- **Servers & channels:** Discord-like hierarchy with real-time messaging
- **Nostr profiles:** Avatar, banner, bio, NIP-05 — pulled from the network
- **Web of Trust:** Spam resistance via Nostr's social graph
- **La Crypta UI:** Dark theme, green accents, skeleton loading

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 16 + TypeScript + Tailwind v4 |
| Auth | Nostr (NDK + nostr-tools) |
| API | Next.js API Routes |
| Realtime | Socket.io |
| DB | SQLite (dev) / PostgreSQL (prod) |
| ORM | Prisma |
| State | Zustand |

## Data Model

```
Server
  -> channels[]
  -> members[]

Channel
  -> messages[]

Message
  -> author (Nostr pubkey)
  -> reactions[]
  -> reply_to (threads)

Member
  -> pubkey + role + cached Nostr profile
```

## Auth Flow

1. Client requests login
2. Server generates challenge (random string + timestamp)
3. Client signs challenge with Nostr key (NIP-07 / nsec / bunker)
4. Server verifies signature against pubkey
5. Server issues JWT/session token

## Roadmap

See [ROADMAP.md](ROADMAP.md) for the full development plan.

## Why This Wins

1. **Solves a real problem** — La Crypta uses Discord, but their identity lives on Nostr
2. **Identity innovation** — Nostr keys as universal identity, badges as roles, NIP-05 as verification
3. **Impressive demo** — Real-time chat always impresses
4. **Pragmatic** — Uses each technology where it makes sense
5. **Extensible** — Voice, video, bots, bridges to Nostr relays

## Resources

- [NDK Documentation](https://ndk.fyi)
- [Nostr Protocol](https://nostr.com)
- [NIPs Repository](https://github.com/nostr-protocol/nips)
- [La Crypta](https://lacrypta.ar)

---

Built with lightning by [La Crypta](https://lacrypta.ar)
