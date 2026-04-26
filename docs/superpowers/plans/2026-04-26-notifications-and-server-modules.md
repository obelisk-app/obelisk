# Notifications + `server.ts` Modular Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship WhatsApp-style browser notifications (mentions/DMs default, per-channel + per-server mute with durations, soft permission prompt, suppression when actively watching). Land it on a refactored `server/` directory that splits the 999-line `server.ts` into focused handler modules with `ServerContext`-injected state and pure helpers in `src/lib/server/`.

**Architecture:** Phase A refactors `server.ts` into `server/{index,context,state,api-bridge,auth-middleware,handlers/*,bootstrap/*}.ts`, extracting pure logic to `src/lib/server/`. Phase B adds REST endpoints for `NotificationPreference`, a `src/lib/notifications/` client module, a Zustand store, and three UI surfaces (channel-header bell, server-context menu, settings panel). The `Notification` socket event payload is extended with `scopeChain` + `senderName` (additive, backwards-compatible) so client-side mute resolution can walk channel → server inheritance without round-trips.

**Tech Stack:** Next.js 16, TypeScript, Socket.io 4, Prisma 7, Zustand 5, Vitest + RTL. Web Notifications API (no service worker — foreground-only). Postgres (no schema changes — `NotificationPreference` and `InboxItem` tables already exist from migration `20260419000000_add_notification_prefs_and_inbox`).

**Spec:** `docs/superpowers/specs/2026-04-26-notifications-and-server-modules-design.md`

**Phase ordering:** Phase A (refactor) MUST land before Phase B (notifications). Phase B depends on `src/lib/server/scope-chain.ts` (created in Task A6) and the `server/handlers/notifications.ts` fan-out helper (created in Task A14).

---

## File Structure

### New files (Phase A — refactor)

```
server/
├── index.ts                            # bootstrap (~50 lines)
├── context.ts                          # ServerContext type + factory
├── state.ts                            # ServerState (in-memory Maps)
├── api-bridge.ts                       # typed replacements for globalThis.__io etc.
├── auth-middleware.ts                  # socket handshake auth
├── handlers/
│   ├── presence.ts
│   ├── rooms.ts
│   ├── messages.ts
│   ├── reactions.ts
│   ├── typing.ts
│   ├── read-state.ts
│   ├── voice.ts
│   ├── notifications.ts                # fan-out helpers (used by messages.ts)
│   └── disconnect.ts
└── bootstrap/
    ├── profile-sync.ts
    ├── bot-poller.ts
    └── games.ts

src/lib/server/                          # pure helpers (unit-testable, no Socket.io)
├── room-keys.ts
├── presence-snapshot.ts
├── voice-capacity.ts
├── voice-payload.ts
└── scope-chain.ts
```

### New files (Phase B — notifications)

```
src/lib/notifications/
├── index.ts                            # NotificationCenter public API
├── permission.ts                       # browser permission state machine
├── suppression.ts                      # pure: shouldSuppress(payload, ctx)
└── prefs.ts                            # pure: resolveScope(prefs, scopeChain)

src/store/notificationPrefs.ts          # Zustand store

src/app/api/notification-preferences/
└── route.ts                            # GET / PUT / DELETE

src/components/notifications/
└── NotifyMenu.tsx                      # bell-icon popover (channel + server)

src/components/settings/
└── NotificationsSection.tsx            # settings panel
```

### Modified files (Phase A)

- `server.ts` → DELETED after Task A16
- `package.json` → `dev` and `build` scripts point at `server/index.ts`
- All API routes that read `globalThis.__io` → import from `@/server/api-bridge`

### Modified files (Phase B)

- `src/hooks/chat/useSocketLifecycle.ts` → call `NotificationCenter.notify(data)` in the `Notification` socket handler
- `src/components/chat/MessageArea.tsx` → bell icon in channel header
- `src/components/chat/ServerBar.tsx` → right-click → "Notification settings"
- `src/store/settings.ts` → add `'notifications'` to `SettingsSection` type
- `src/components/settings/SettingsModal.tsx` → register the new section

---

# PHASE A — `server.ts` Refactor

Each task in Phase A leaves `npm test` green AND the dev server functional (`npm run dev` + manual smoke: login, send message, voice). Per CLAUDE.md: a step is not "done" until tests pass.

---

## Task A1: Scaffold `server/` directory with shim entry point

**Files:**
- Create: `server/index.ts`
- Modify: `package.json` (line containing `"dev": ...` and `"build": ...`)

- [ ] **Step 1: Create `server/index.ts` as a re-export shim**

This keeps behavior identical while we set up the directory. Subsequent tasks gradually move code out of `server.ts` into `server/`.

```ts
// server/index.ts
// Entry point. During the refactor, this re-exports from the legacy
// server.ts so package.json scripts can point here without behavior change.
// Subsequent tasks move handlers/state into this directory; the final
// task deletes server.ts entirely.
import '../server';
```

- [ ] **Step 2: Update `package.json` scripts**

Change the `dev` and `build` script entries:

```json
{
  "scripts": {
    "dev": "prisma generate && tsx watch server/index.ts",
    "build": "prisma generate && prisma migrate deploy && next build"
  }
}
```

(Only `dev` changes — `build` already uses `next build`, no entry-point change.)

- [ ] **Step 3: Run dev server smoke test**

```bash
npm run dev
```

Expected: server boots on http://localhost:3000, no errors. Open the app, log in, send a message in any channel. Ctrl-C to stop.

- [ ] **Step 4: Run test suite**

```bash
npm test
```

Expected: all tests pass (no test changes yet, just verifying the shim doesn't break anything).

- [ ] **Step 5: Commit**

```bash
git add server/index.ts package.json
git commit -m "refactor(server): scaffold server/ entry point as shim over server.ts"
```

---

## Task A2: Extract `ServerState` and `ServerContext` (no behavior change)

**Files:**
- Create: `server/state.ts`
- Create: `server/context.ts`

- [ ] **Step 1: Create `server/state.ts`**

```ts
// server/state.ts
// In-memory state shared across socket handlers. Lifted out of server.ts so
// handler modules can read/write the same Maps via ServerContext.

export interface ServerState {
  /** pubkey → socketIds. Drives presence, fan-out, multi-tab read sync. */
  pubkeySockets: Map<string, Set<string>>;
  /** socketId → channelId. Tracks which voice channel each socket is in. */
  voiceSockets: Map<string, string>;
  /** socketId → pubkey. Used for voice signaling target resolution. */
  voiceSocketPubkey: Map<string, string>;
  /** channelId → pubkeys currently sharing camera. Per-channel cap. */
  cameraSharers: Map<string, Set<string>>;
  /** channelId → pubkeys currently sharing screen. Per-channel cap. */
  screenSharers: Map<string, Set<string>>;
}

export function createServerState(): ServerState {
  return {
    pubkeySockets: new Map(),
    voiceSockets: new Map(),
    voiceSocketPubkey: new Map(),
    cameraSharers: new Map(),
    screenSharers: new Map(),
  };
}
```

- [ ] **Step 2: Create `server/context.ts`**

```ts
// server/context.ts
// Dependency-injection container passed into every handler. Lets handlers
// read shared state, emit via io, and query the database without reaching
// for module-level globals.

import type { Server as IOServer } from 'socket.io';
import type { PrismaClient } from '@/generated/prisma/client';
import { type ServerState, createServerState } from './state';

export interface ServerContext {
  io: IOServer;
  prisma: PrismaClient;
  state: ServerState;
  limits: { maxCameras: number; maxScreens: number };
}

export function createServerContext(
  io: IOServer,
  prisma: PrismaClient,
  limits = { maxCameras: 4, maxScreens: 2 },
): ServerContext {
  return {
    io,
    prisma,
    state: createServerState(),
    limits,
  };
}
```

- [ ] **Step 3: Run test suite**

```bash
npm test
```

Expected: all tests pass. (Files are unused so far — pure additions.)

- [ ] **Step 4: Run dev server smoke test**

```bash
npm run dev
```

Expected: clean boot, no errors. Ctrl-C.

- [ ] **Step 5: Commit**

```bash
git add server/state.ts server/context.ts
git commit -m "refactor(server): add ServerState + ServerContext (unused)"
```

---

## Task A3: Create `server/api-bridge.ts` to replace `globalThis.__io`

**Files:**
- Create: `server/api-bridge.ts`

- [ ] **Step 1: Identify current `globalThis.__io` consumers**

```bash
grep -rln "globalThis as any).__io\|globalThis\.__io\|__disconnectPubkey\|__emitModEvent" src/ server.ts
```

Note the list — Task A4 will update them. For this task, only the bridge module is created.

- [ ] **Step 2: Create `server/api-bridge.ts`**

```ts
// server/api-bridge.ts
// Typed bridge between Next.js API routes and the live Socket.io server.
// Replaces the untyped `globalThis.__io`, `__disconnectPubkey`, and
// `__emitModEvent` accesses. Bound once at boot (server/index.ts) via
// `bindContext()`. API routes call `getIO()` etc. — no globalThis touching.

import type { Server as IOServer } from 'socket.io';
import type { ServerContext } from './context';

let activeContext: ServerContext | null = null;

export function bindContext(ctx: ServerContext): void {
  activeContext = ctx;
}

export function getContext(): ServerContext {
  if (!activeContext) {
    throw new Error('ServerContext not bound — server/index.ts must call bindContext at boot');
  }
  return activeContext;
}

export function getIO(): IOServer {
  return getContext().io;
}

export function disconnectPubkey(pubkey: string, reason: string): void {
  const { io, state } = getContext();
  const sockets = state.pubkeySockets.get(pubkey);
  if (!sockets) return;
  for (const socketId of sockets) {
    const sock = io.sockets.sockets.get(socketId);
    if (sock) {
      sock.emit('ForceDisconnect', { reason });
      sock.disconnect(true);
    }
  }
}

export function emitModEvent(serverId: string, event: string, payload: unknown): void {
  getIO().to(`server:${serverId}`).emit(event, payload);
}
```

- [ ] **Step 3: Run test suite**

```bash
npm test
```

Expected: all tests pass (bridge is unused so far).

- [ ] **Step 4: Commit**

```bash
git add server/api-bridge.ts
git commit -m "refactor(server): add typed api-bridge for API route → socket calls"
```

---

## Task A4: Extract `room-keys.ts` to `src/lib/server/`

**Files:**
- Create: `src/lib/server/room-keys.ts`
- Create: `src/lib/server/room-keys.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/server/room-keys.test.ts
import { describe, it, expect } from 'vitest';
import { roomFor } from './room-keys';

describe('roomFor', () => {
  it('formats channel rooms', () => {
    expect(roomFor.channel('ch_abc')).toBe('channel:ch_abc');
  });

  it('formats server rooms', () => {
    expect(roomFor.server('srv_xyz')).toBe('server:srv_xyz');
  });

  it('formats DM rooms by pubkey', () => {
    expect(roomFor.dm('npub1foo')).toBe('dm:npub1foo');
  });

  it('formats post rooms', () => {
    expect(roomFor.post('post_123')).toBe('post:post_123');
  });

  it('avoids cross-namespace collision: same id, different scope', () => {
    expect(roomFor.channel('abc')).not.toBe(roomFor.server('abc'));
    expect(roomFor.dm('abc')).not.toBe(roomFor.post('abc'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/server/room-keys.test.ts
```

Expected: FAIL with module-not-found error for `./room-keys`.

- [ ] **Step 3: Create `src/lib/server/room-keys.ts`**

```ts
// src/lib/server/room-keys.ts
// Centralized Socket.io room name formatters. Prevents typos like
// `channel:${id}` vs `channels:${id}` from silently splitting fan-out.

export const roomFor = {
  channel: (id: string) => `channel:${id}`,
  server: (id: string) => `server:${id}`,
  dm: (pubkey: string) => `dm:${pubkey}`,
  post: (postId: string) => `post:${postId}`,
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/server/room-keys.test.ts
```

Expected: PASS, 5/5.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/room-keys.ts src/lib/server/room-keys.test.ts
git commit -m "refactor(server): extract room-keys to src/lib/server with tests"
```

---

## Task A5: Extract `presence-snapshot.ts` to `src/lib/server/`

**Files:**
- Create: `src/lib/server/presence-snapshot.ts`
- Create: `src/lib/server/presence-snapshot.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/server/presence-snapshot.test.ts
import { describe, it, expect } from 'vitest';
import { buildPresenceSnapshot } from './presence-snapshot';

describe('buildPresenceSnapshot', () => {
  it('returns an empty list when no one is online', () => {
    expect(buildPresenceSnapshot(new Map())).toEqual([]);
  });

  it('returns one entry per pubkey regardless of socket count (multi-tab dedup)', () => {
    const m = new Map<string, Set<string>>();
    m.set('npub_alice', new Set(['s1', 's2', 's3']));
    m.set('npub_bob', new Set(['s4']));
    const snap = buildPresenceSnapshot(m);
    expect(snap.sort()).toEqual(['npub_alice', 'npub_bob']);
  });

  it('skips pubkeys with empty socket sets (defensive)', () => {
    const m = new Map<string, Set<string>>();
    m.set('npub_alice', new Set());
    m.set('npub_bob', new Set(['s1']));
    expect(buildPresenceSnapshot(m)).toEqual(['npub_bob']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/server/presence-snapshot.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/lib/server/presence-snapshot.ts`**

```ts
// src/lib/server/presence-snapshot.ts
// Build the "who is online" pubkey list from the live socket map. A pubkey
// appears at most once even if the user has multiple tabs open.

export function buildPresenceSnapshot(
  pubkeySockets: Map<string, Set<string>>,
): string[] {
  const out: string[] = [];
  for (const [pubkey, sockets] of pubkeySockets) {
    if (sockets.size > 0) out.push(pubkey);
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/server/presence-snapshot.test.ts
```

Expected: PASS, 3/3.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/presence-snapshot.ts src/lib/server/presence-snapshot.test.ts
git commit -m "refactor(server): extract presence-snapshot helper"
```

---

## Task A6: Extract `scope-chain.ts` to `src/lib/server/` (new — needed by Phase B)

**Files:**
- Create: `src/lib/server/scope-chain.ts`
- Create: `src/lib/server/scope-chain.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/server/scope-chain.test.ts
import { describe, it, expect } from 'vitest';
import { buildScopeChain } from './scope-chain';

describe('buildScopeChain', () => {
  it('returns 2 elements for a channel inside a server, channel first', () => {
    expect(buildScopeChain({ channelId: 'ch_x', serverId: 's_y' })).toEqual([
      { type: 'channel', id: 'ch_x' },
      { type: 'server', id: 's_y' },
    ]);
  });

  it('returns 1 element for a server-only event', () => {
    expect(buildScopeChain({ serverId: 's_y' })).toEqual([
      { type: 'server', id: 's_y' },
    ]);
  });

  it('returns 1 element for a DM (counterparty pubkey)', () => {
    expect(buildScopeChain({ dmCounterparty: 'npub_alice' })).toEqual([
      { type: 'dm', id: 'npub_alice' },
    ]);
  });

  it('returns an empty chain when nothing is scoped (defensive)', () => {
    expect(buildScopeChain({})).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/server/scope-chain.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/lib/server/scope-chain.ts`**

```ts
// src/lib/server/scope-chain.ts
// Build the most-specific → least-specific scope chain for a notification
// payload. Walked client-side by `lib/notifications/prefs.resolveScope` to
// determine which NotificationPreference row applies (channel overrides
// server-level mute).

export type ScopeRef =
  | { type: 'channel'; id: string }
  | { type: 'server'; id: string }
  | { type: 'dm'; id: string };

export interface ScopeChainInput {
  channelId?: string;
  serverId?: string;
  dmCounterparty?: string;
}

export function buildScopeChain(input: ScopeChainInput): ScopeRef[] {
  const chain: ScopeRef[] = [];
  if (input.dmCounterparty) {
    chain.push({ type: 'dm', id: input.dmCounterparty });
    return chain;
  }
  if (input.channelId) chain.push({ type: 'channel', id: input.channelId });
  if (input.serverId) chain.push({ type: 'server', id: input.serverId });
  return chain;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/server/scope-chain.test.ts
```

Expected: PASS, 4/4.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/scope-chain.ts src/lib/server/scope-chain.test.ts
git commit -m "refactor(server): add scope-chain helper for notification fan-out"
```

---

## Task A7: Extract `voice-capacity.ts` to `src/lib/server/`

**Files:**
- Create: `src/lib/server/voice-capacity.ts`
- Create: `src/lib/server/voice-capacity.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/server/voice-capacity.test.ts
import { describe, it, expect } from 'vitest';
import { canAddCamera, canAddScreen } from './voice-capacity';

const limits = { maxCameras: 4, maxScreens: 2 };

describe('canAddCamera', () => {
  it('allows when channel has no sharers', () => {
    expect(canAddCamera(new Map(), 'ch1', 'pk1', limits)).toBe(true);
  });

  it('allows when under capacity', () => {
    const m = new Map([['ch1', new Set(['pk1', 'pk2'])]]);
    expect(canAddCamera(m, 'ch1', 'pk3', limits)).toBe(true);
  });

  it('denies when at capacity', () => {
    const m = new Map([['ch1', new Set(['pk1', 'pk2', 'pk3', 'pk4'])]]);
    expect(canAddCamera(m, 'ch1', 'pk5', limits)).toBe(false);
  });

  it('allows the same pubkey re-asserting (idempotent)', () => {
    const m = new Map([['ch1', new Set(['pk1', 'pk2', 'pk3', 'pk4'])]]);
    expect(canAddCamera(m, 'ch1', 'pk2', limits)).toBe(true);
  });
});

describe('canAddScreen', () => {
  it('allows when under capacity', () => {
    const m = new Map([['ch1', new Set(['pk1'])]]);
    expect(canAddScreen(m, 'ch1', 'pk2', limits)).toBe(true);
  });

  it('denies at capacity', () => {
    const m = new Map([['ch1', new Set(['pk1', 'pk2'])]]);
    expect(canAddScreen(m, 'ch1', 'pk3', limits)).toBe(false);
  });

  it('allows the same pubkey re-asserting', () => {
    const m = new Map([['ch1', new Set(['pk1', 'pk2'])]]);
    expect(canAddScreen(m, 'ch1', 'pk1', limits)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/server/voice-capacity.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/lib/server/voice-capacity.ts`**

```ts
// src/lib/server/voice-capacity.ts
// Camera/screen-share capacity gate for voice channels. Capacity is
// per-channel; the same pubkey re-asserting is allowed (idempotent — the
// caller may be reconnecting after a brief network blip).

export interface VoiceLimits {
  maxCameras: number;
  maxScreens: number;
}

function canAdd(
  sharers: Map<string, Set<string>>,
  channelId: string,
  pubkey: string,
  max: number,
): boolean {
  const set = sharers.get(channelId);
  if (!set) return true;
  if (set.has(pubkey)) return true; // already counted
  return set.size < max;
}

export function canAddCamera(
  cameraSharers: Map<string, Set<string>>,
  channelId: string,
  pubkey: string,
  limits: VoiceLimits,
): boolean {
  return canAdd(cameraSharers, channelId, pubkey, limits.maxCameras);
}

export function canAddScreen(
  screenSharers: Map<string, Set<string>>,
  channelId: string,
  pubkey: string,
  limits: VoiceLimits,
): boolean {
  return canAdd(screenSharers, channelId, pubkey, limits.maxScreens);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/server/voice-capacity.test.ts
```

Expected: PASS, 7/7.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/voice-capacity.ts src/lib/server/voice-capacity.test.ts
git commit -m "refactor(server): extract voice-capacity helpers"
```

---

## Task A8: Extract `voice-payload.ts` to `src/lib/server/`

**Files:**
- Create: `src/lib/server/voice-payload.ts`
- Create: `src/lib/server/voice-payload.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/server/voice-payload.test.ts
import { describe, it, expect } from 'vitest';
import { validateVoiceSignal } from './voice-payload';

describe('validateVoiceSignal', () => {
  it('accepts a valid SDP offer', () => {
    expect(validateVoiceSignal({
      to: 'npub_b',
      signal: { type: 'offer', sdp: 'v=0\no=...\n' },
    })).toBe(true);
  });

  it('accepts a valid SDP answer', () => {
    expect(validateVoiceSignal({
      to: 'npub_b',
      signal: { type: 'answer', sdp: 'v=0\no=...\n' },
    })).toBe(true);
  });

  it('accepts an ICE candidate', () => {
    expect(validateVoiceSignal({
      to: 'npub_b',
      signal: { type: 'ice', candidate: { candidate: '...', sdpMid: '0' } },
    })).toBe(true);
  });

  it('rejects missing `to`', () => {
    expect(validateVoiceSignal({
      signal: { type: 'offer', sdp: '...' },
    } as any)).toBe(false);
  });

  it('rejects unknown signal type', () => {
    expect(validateVoiceSignal({
      to: 'npub_b',
      signal: { type: 'mystery', sdp: '...' },
    } as any)).toBe(false);
  });

  it('rejects null signal', () => {
    expect(validateVoiceSignal({ to: 'npub_b', signal: null } as any)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/server/voice-payload.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/lib/server/voice-payload.ts`**

```ts
// src/lib/server/voice-payload.ts
// Shape validation for client-emitted voice signaling payloads. We don't
// inspect SDP content — just confirm the envelope so we don't relay garbage
// to the target peer.

export interface VoiceSignalPayload {
  to: string;
  signal:
    | { type: 'offer'; sdp: string }
    | { type: 'answer'; sdp: string }
    | { type: 'ice'; candidate: unknown };
}

export function validateVoiceSignal(p: unknown): p is VoiceSignalPayload {
  if (!p || typeof p !== 'object') return false;
  const obj = p as Record<string, unknown>;
  if (typeof obj.to !== 'string' || obj.to.length === 0) return false;
  const sig = obj.signal as Record<string, unknown> | null;
  if (!sig || typeof sig !== 'object') return false;
  if (sig.type === 'offer' || sig.type === 'answer') {
    return typeof sig.sdp === 'string';
  }
  if (sig.type === 'ice') {
    return sig.candidate !== undefined;
  }
  return false;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/server/voice-payload.test.ts
```

Expected: PASS, 6/6.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/voice-payload.ts src/lib/server/voice-payload.test.ts
git commit -m "refactor(server): extract voice-payload validator"
```

---

## Task A9: Move auth middleware to `server/auth-middleware.ts`

**Files:**
- Create: `server/auth-middleware.ts`
- Modify: `server.ts` (lines 64–87 — the `io.use(...)` block)

- [ ] **Step 1: Create `server/auth-middleware.ts`**

```ts
// server/auth-middleware.ts
// Socket.io connection-time auth. Parses the session cookie from the
// handshake, validates against the Session table, and attaches the
// pubkey to socket.data for downstream handlers.

import type { Socket } from 'socket.io';
import type { ServerContext } from './context';

type NextFn = (err?: Error) => void;

export function authMiddleware(ctx: ServerContext) {
  return async (socket: Socket, next: NextFn) => {
    const cookie = socket.handshake.headers.cookie;
    if (!cookie) return next(new Error('No cookie'));

    const sessionToken = cookie
      .split(';')
      .map((c: string) => c.trim())
      .find((c: string) => c.startsWith('session='))
      ?.split('=')[1];

    if (!sessionToken) return next(new Error('No session'));

    try {
      const session = await ctx.prisma.session.findUnique({ where: { token: sessionToken } });
      if (!session || new Date() > session.expiresAt) {
        return next(new Error('Invalid session'));
      }
      socket.data.pubkey = session.pubkey;
      next();
    } catch {
      next(new Error('Auth error'));
    }
  };
}
```

- [ ] **Step 2: Update `server.ts` to use the new middleware**

In `server.ts`, replace lines 64–87 (the inline `io.use(async (socket, next) => { ... })` block) with:

```ts
  const { authMiddleware } = await import('./server/auth-middleware');
  const { createServerContext } = await import('./server/context');
  const { bindContext } = await import('./server/api-bridge');
  const ctx = createServerContext(io, prisma);
  bindContext(ctx);
  io.use(authMiddleware(ctx));
```

This also stands up `ServerContext` for future tasks. Move `pubkeySockets`, `voiceSockets`, etc. references in the rest of `server.ts` to `ctx.state.pubkeySockets`, `ctx.state.voiceSockets`, etc.

Concretely, find every reference to the module-level Maps (`pubkeySockets`, `voiceSockets`, `voiceSocketPubkey`, `cameraSharers`, `screenSharers`) in `server.ts` and replace with `ctx.state.X`. Delete the original `const X = new Map(...)` declarations at the top of the file (lines 22–29 and the one at ~line 90).

Use this script to find every reference:

```bash
grep -n "pubkeySockets\|voiceSockets\|voiceSocketPubkey\|cameraSharers\|screenSharers" server.ts
```

For each line in the output, replace `X` with `ctx.state.X`. Then delete the original Map declarations.

- [ ] **Step 3: Run test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Run dev server smoke test**

```bash
npm run dev
```

Then in a browser:
- Log in with nsec or NIP-07
- Send a message in any channel
- Open a voice channel briefly
- Confirm presence dot appears for your user

Expected: all features work as before. Ctrl-C.

- [ ] **Step 5: Commit**

```bash
git add server/auth-middleware.ts server.ts
git commit -m "refactor(server): extract auth middleware, wire ServerContext through"
```

---

## Task A10: Move presence handler to `server/handlers/presence.ts`

**Files:**
- Create: `server/handlers/presence.ts`
- Modify: `server.ts` (lines ~89–114, the presence/connection-tracking block)

- [ ] **Step 1: Create `server/handlers/presence.ts`**

```ts
// server/handlers/presence.ts
// Tracks pubkey → socket IDs and emits PresenceUpdate when a user comes
// online (registers their first socket). Offline emission lives in
// disconnect.ts since it depends on the disconnect lifecycle.

import type { Socket } from 'socket.io';
import type { ServerContext } from '../context';
import { buildPresenceSnapshot } from '@/lib/server/presence-snapshot';

export function register(ctx: ServerContext, socket: Socket): void {
  const pubkey = socket.data.pubkey as string;
  const { state, io } = ctx;

  let sockets = state.pubkeySockets.get(pubkey);
  const wasOffline = !sockets || sockets.size === 0;
  if (!sockets) {
    sockets = new Set();
    state.pubkeySockets.set(pubkey, sockets);
  }
  sockets.add(socket.id);

  if (wasOffline) {
    io.emit('PresenceUpdate', { pubkey, online: true });
  }

  // Send the new socket the current online snapshot.
  socket.emit('PresenceSync', buildPresenceSnapshot(state.pubkeySockets));
}
```

- [ ] **Step 2: Wire it from `server.ts`**

In `server.ts`, find the `io.on('connection', async (socket) => { ... })` block. At the very top of the connection handler, **before** the existing presence-tracking code, add:

```ts
    const { register: registerPresence } = await import('./server/handlers/presence');
    registerPresence(ctx, socket);
```

Then **delete** the lines 89–114 of the original `server.ts` (the inline presence block) — the new handler does the same work.

- [ ] **Step 3: Run test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Smoke test multi-tab presence**

```bash
npm run dev
```

Open the app in two tabs as the same user. Then in a third browser session, log in as a different user. Confirm both users appear online to each other. Close all tabs of one user — they should appear offline to the other.

Expected: presence works as before. Ctrl-C.

- [ ] **Step 5: Commit**

```bash
git add server/handlers/presence.ts server.ts
git commit -m "refactor(server): move presence tracking into handler module"
```

---

## Task A11: Move rooms handler (Join/Leave Server, Join/Leave Channel)

**Files:**
- Create: `server/handlers/rooms.ts`
- Modify: `server.ts` (lines ~118–166)

- [ ] **Step 1: Create `server/handlers/rooms.ts`**

```ts
// server/handlers/rooms.ts
// Socket room membership for server- and channel-scoped fan-out. Channel
// joins are gated by channel-read permission; server joins by Member.

import type { Socket } from 'socket.io';
import type { ServerContext } from '../context';
import { roomFor } from '@/lib/server/room-keys';
import { canReadChannel } from '@/lib/roles';
import { resolveMemberAccess } from '@/lib/channel-access';

export function register(ctx: ServerContext, socket: Socket): void {
  const pubkey = socket.data.pubkey as string;
  const { prisma } = ctx;

  socket.on('JoinServer', async ({ serverId }: { serverId: string }) => {
    const member = await prisma.member.findUnique({
      where: { serverId_pubkey: { serverId, pubkey } },
    });
    if (!member) return;
    socket.join(roomFor.server(serverId));
  });

  socket.on('LeaveServer', ({ serverId }: { serverId: string }) => {
    socket.leave(roomFor.server(serverId));
  });

  socket.on('JoinChannel', async ({ channelId }: { channelId: string }) => {
    const channel = await prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) return;
    const access = await resolveMemberAccess(prisma, channel.serverId, pubkey);
    if (!access || !canReadChannel(access.role, channel)) return;
    socket.join(roomFor.channel(channelId));
  });

  socket.on('LeaveChannel', ({ channelId }: { channelId: string }) => {
    socket.leave(roomFor.channel(channelId));
  });
}
```

- [ ] **Step 2: Wire from `server.ts`**

Inside the `io.on('connection', ...)` block, after the `registerPresence(ctx, socket)` call, add:

```ts
    const { register: registerRooms } = await import('./server/handlers/rooms');
    registerRooms(ctx, socket);
```

Then **delete** lines 118–166 of `server.ts` (the inline `socket.on('JoinServer'...)` etc. handlers).

- [ ] **Step 3: Run test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Smoke test channel join**

```bash
npm run dev
```

Log in, click any channel, send a message. Open a second tab as a different user, also navigate to that channel. Confirm both see each other's messages in real time.

Expected: real-time fan-out works as before. Ctrl-C.

- [ ] **Step 5: Commit**

```bash
git add server/handlers/rooms.ts server.ts
git commit -m "refactor(server): move room join/leave into handler module"
```

---

## Task A12: Move typing handler

**Files:**
- Create: `server/handlers/typing.ts`
- Modify: `server.ts` (lines ~540–556)

- [ ] **Step 1: Create `server/handlers/typing.ts`**

```ts
// server/handlers/typing.ts
// Channel and DM typing indicators. Best-effort fan-out — no persistence.

import type { Socket } from 'socket.io';
import type { ServerContext } from '../context';
import { roomFor } from '@/lib/server/room-keys';

export function register(ctx: ServerContext, socket: Socket): void {
  const pubkey = socket.data.pubkey as string;
  const { io, state } = ctx;

  socket.on('UserTyping', ({ channelId }: { channelId: string }) => {
    socket.to(roomFor.channel(channelId)).emit('UserTyping', { pubkey, channelId });
  });

  socket.on('DMUserTyping', ({ to }: { to: string }) => {
    const targets = state.pubkeySockets.get(to);
    if (!targets) return;
    for (const socketId of targets) {
      io.to(socketId).emit('DMUserTyping', { pubkey });
    }
  });
}
```

- [ ] **Step 2: Wire from `server.ts`**

Inside the connection handler (after `registerRooms`), add:

```ts
    const { register: registerTyping } = await import('./server/handlers/typing');
    registerTyping(ctx, socket);
```

Then **delete** lines 540–556 of `server.ts`.

- [ ] **Step 3: Run tests**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 4: Smoke test typing**

```bash
npm run dev
```

Two tabs as different users in same channel. One starts typing — the other should see "X is typing…". Ctrl-C.

- [ ] **Step 5: Commit**

```bash
git add server/handlers/typing.ts server.ts
git commit -m "refactor(server): move typing indicators into handler module"
```

---

## Task A13: Move read-state and reactions handlers

**Files:**
- Create: `server/handlers/read-state.ts`
- Create: `server/handlers/reactions.ts`
- Modify: `server.ts` (lines ~450–482 reactions, ~558–651 read-state)

- [ ] **Step 1: Create `server/handlers/read-state.ts`**

```ts
// server/handlers/read-state.ts
// MarkRead / MarkMentionRead / DMRead handlers. Persist the read cursor
// then fan out to the user's other sockets so badges clear across tabs.

import type { Socket } from 'socket.io';
import type { ServerContext } from '../context';
import { fanOutReadUpdate } from '@/lib/read-fanout';

export function register(ctx: ServerContext, socket: Socket): void {
  const pubkey = socket.data.pubkey as string;
  const { io, state, prisma } = ctx;

  socket.on('MarkRead', async ({ channelId }: { channelId: string }) => {
    await prisma.channelReadState.upsert({
      where: { pubkey_channelId: { pubkey, channelId } },
      create: { pubkey, channelId, lastReadAt: new Date() },
      update: { lastReadAt: new Date() },
    });
    fanOutReadUpdate(io, state.pubkeySockets, pubkey, 'read-update', { channelId });
  });

  socket.on('MarkMentionRead', async ({ channelId }: { channelId: string }) => {
    await prisma.channelReadState.upsert({
      where: { pubkey_channelId: { pubkey, channelId } },
      create: { pubkey, channelId, lastMentionReadAt: new Date() },
      update: { lastMentionReadAt: new Date() },
    });
    fanOutReadUpdate(io, state.pubkeySockets, pubkey, 'mention-read-update', { channelId });
  });

  socket.on('DMRead', async ({ pubkey: counterparty }: { pubkey: string }) => {
    await prisma.dMReadState.upsert({
      where: { pubkey_counterpartyPubkey: { pubkey, counterpartyPubkey: counterparty } },
      create: { pubkey, counterpartyPubkey: counterparty, lastReadAt: new Date() },
      update: { lastReadAt: new Date() },
    });
    fanOutReadUpdate(io, state.pubkeySockets, pubkey, 'dm-read-update', { pubkey: counterparty });
  });
}
```

> **Note:** Adjust the upsert `where` clause + field names to match your actual Prisma schema. Run `grep -n "channelReadState\|dMReadState" server.ts` first to copy the exact shapes used today, then mirror them here. If the existing `MarkRead` handler in `server.ts` writes additional fields (like `lastReadMessageId`), include them.

- [ ] **Step 2: Create `server/handlers/reactions.ts`**

```ts
// server/handlers/reactions.ts
// ToggleReaction handler. Reads existing reactions, toggles by (messageId,
// pubkey, emoji), then re-emits the full reactions list to the channel
// room.

import type { Socket } from 'socket.io';
import type { ServerContext } from '../context';
import { roomFor } from '@/lib/server/room-keys';

export function register(ctx: ServerContext, socket: Socket): void {
  const pubkey = socket.data.pubkey as string;
  const { io, prisma } = ctx;

  socket.on('ToggleReaction', async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: { channel: true },
    });
    if (!message) return;

    const existing = await prisma.reaction.findFirst({
      where: { messageId, pubkey, emoji },
    });

    if (existing) {
      await prisma.reaction.delete({ where: { id: existing.id } });
    } else {
      await prisma.reaction.create({ data: { messageId, pubkey, emoji } });
    }

    const reactions = await prisma.reaction.findMany({ where: { messageId } });
    io.to(roomFor.channel(message.channelId)).emit('ReactionUpdated', { messageId, reactions });
  });
}
```

> **Note:** Mirror the original `server.ts` reactions block precisely — copy the existing payload shape and any author-profile lookups.

- [ ] **Step 3: Wire from `server.ts`**

```ts
    const { register: registerReadState } = await import('./server/handlers/read-state');
    const { register: registerReactions } = await import('./server/handlers/reactions');
    registerReadState(ctx, socket);
    registerReactions(ctx, socket);
```

Then **delete** the corresponding inline blocks (~450–482, ~558–651 in the original).

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 5: Smoke test**

```bash
npm run dev
```

- React to a message — emoji shows up for both users.
- Open a channel, then leave — unread badge clears.
- Receive a DM, mark read — counter clears across tabs.

Ctrl-C.

- [ ] **Step 6: Commit**

```bash
git add server/handlers/read-state.ts server/handlers/reactions.ts server.ts
git commit -m "refactor(server): move read-state + reactions into handler modules"
```

---

## Task A14: Move messages + notifications fan-out (extends `Notification` payload)

**Files:**
- Create: `server/handlers/notifications.ts`
- Create: `server/handlers/messages.ts`
- Modify: `server.ts` (lines ~168–448 — SendMessage + EditMessage + DeleteMessage)

This is the largest single move. It also extends the `Notification` event payload with `scopeChain` + `senderName` (additive, backwards-compatible — existing client code keeps working).

- [ ] **Step 1: Create `server/handlers/notifications.ts`**

```ts
// server/handlers/notifications.ts
// Notification fan-out helpers. Centralizes Notification socket event
// payload construction so all emission paths (mention, reply, everyone, dm)
// produce a consistent shape with scopeChain and senderName resolved.

import type { ServerContext } from '../context';
import { buildScopeChain } from '@/lib/server/scope-chain';

export interface BaseNotificationFields {
  type: 'mention' | 'reply' | 'everyone' | 'dm';
  serverId?: string;
  channelId?: string;
  postId?: string;
  messageId?: string;
  senderPubkey: string;
  preview?: string;
  createdAt?: string;
}

async function resolveSenderName(
  ctx: ServerContext,
  serverId: string | undefined,
  pubkey: string,
): Promise<string | undefined> {
  if (!serverId) return undefined;
  const member = await ctx.prisma.member.findUnique({
    where: { serverId_pubkey: { serverId, pubkey } },
  });
  return member?.displayName ?? undefined;
}

export async function emitNotification(
  ctx: ServerContext,
  recipientPubkey: string,
  fields: BaseNotificationFields,
): Promise<void> {
  const sockets = ctx.state.pubkeySockets.get(recipientPubkey);
  if (!sockets || sockets.size === 0) return;

  const scopeChain =
    fields.type === 'dm'
      ? buildScopeChain({ dmCounterparty: fields.senderPubkey })
      : buildScopeChain({ channelId: fields.channelId, serverId: fields.serverId });

  const senderName = await resolveSenderName(ctx, fields.serverId, fields.senderPubkey);

  const payload = {
    recipientPubkey,
    ...fields,
    createdAt: fields.createdAt ?? new Date().toISOString(),
    scopeChain,
    senderName,
  };

  for (const socketId of sockets) {
    ctx.io.to(socketId).emit('Notification', payload);
  }
}
```

- [ ] **Step 2: Create `server/handlers/messages.ts`**

Open `server.ts` and copy the entire `socket.on('SendMessage', async (...) => { ... })` handler (roughly lines 168–412), the `socket.on('EditMessage', ...)` handler, and the `socket.on('DeleteMessage', ...)` handler into a new file:

```ts
// server/handlers/messages.ts
// Send / Edit / Delete message handlers. Owns the mention fan-out pipeline:
// extract mentions → write Mention rows → enqueue InboxItem → emit
// Notification socket events (via notifications.ts helper).

import type { Socket } from 'socket.io';
import type { ServerContext } from '../context';
import { roomFor } from '@/lib/server/room-keys';
import { extractMentionPubkeys, hasEveryoneMention } from '@/lib/mentions';
import { isServerMember } from '@/lib/mention-fanout';
import { canReadChannel, hasRole } from '@/lib/roles';
import { resolveMemberAccess } from '@/lib/channel-access';
import { getAuthorProfile } from '@/lib/profile-sync';
import { emitNotification } from './notifications';

export function register(ctx: ServerContext, socket: Socket): void {
  const pubkey = socket.data.pubkey as string;
  const { io, prisma } = ctx;

  socket.on('SendMessage', async (payload) => {
    // PASTE the entire body of the existing SendMessage handler here.
    // Replace every `(globalThis as any).__io` with `io`.
    // Replace every direct `io.to(...).emit('Notification', { ... })` call
    // for mentions/replies/everyone with:
    //
    //     await emitNotification(ctx, recipientPubkey, {
    //       type: 'mention' | 'reply' | 'everyone',
    //       serverId, channelId, postId, messageId,
    //       senderPubkey: pubkey,
    //       preview: content.slice(0, 280),
    //     });
    //
    // The helper handles scopeChain + senderName + multi-socket fan-out.
    // Keep all the existing channel ban/mute checks, @everyone gating
    // (mod+ only), forum post subscription fan-out, and unread-update
    // emission. Those are NOT notification logic — leave them intact.
  });

  socket.on('EditMessage', async (payload) => {
    // PASTE the existing EditMessage handler body. No notification changes.
  });

  socket.on('DeleteMessage', async (payload) => {
    // PASTE the existing DeleteMessage handler body. No notification changes.
  });
}
```

> **Important:** This is the trickiest move because the SendMessage handler is ~250 lines with nested mention logic. Open `server.ts` in your editor side-by-side, copy the handler verbatim, then make the two replacements above. Do NOT rewrite the logic — preserve it byte-for-byte except for the Notification emission swap.

> **DM handler:** If the project has a DM send handler (check `grep -n "dm-send\|SendDM\|dmSend" server.ts src/`), it also calls the Notification socket event for `type: 'dm'`. Update that emission point similarly: replace direct `io.to(...).emit('Notification', ...)` for DMs with `await emitNotification(ctx, recipientPubkey, { type: 'dm', senderPubkey: pubkey, preview, ... })`.

- [ ] **Step 3: Wire from `server.ts`**

```ts
    const { register: registerMessages } = await import('./server/handlers/messages');
    registerMessages(ctx, socket);
```

Then **delete** the inline SendMessage/EditMessage/DeleteMessage blocks from `server.ts`.

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: all pass. Several existing tests touch the mention fan-out — they should not regress.

- [ ] **Step 5: Smoke test mentions and DMs**

```bash
npm run dev
```

In two tabs as different users:
- User A sends a message in a channel
- User B receives it (via NewMessage)
- User A sends `@npubB hello` — User B should still get the in-app inbox notification (mention dot, sound, inbox entry) — the existing `useSocketLifecycle` Notification handler ignores `scopeChain` if it's present (additive)
- Send a DM from A to B — same expectations
- Edit your own message — confirm it updates
- Delete your own message — confirm it disappears

Expected: nothing regresses. Ctrl-C.

- [ ] **Step 6: Commit**

```bash
git add server/handlers/notifications.ts server/handlers/messages.ts server.ts
git commit -m "refactor(server): move messages + extend Notification payload with scopeChain"
```

---

## Task A15: Move voice handler

**Files:**
- Create: `server/handlers/voice.ts`
- Modify: `server.ts` (lines ~653–891 — all voice handlers)

Voice is the largest single concern (~240 lines) but self-contained — no cross-handler dependencies beyond `state` and capacity helpers from `lib/server/voice-capacity.ts`.

- [ ] **Step 1: Create `server/handlers/voice.ts`**

```ts
// server/handlers/voice.ts
// Voice channel handlers — P2P signaling, mute/deafen, moderator actions
// (force mute, camera off, screen off), capacity-gated camera/screen
// sharing.

import type { Socket } from 'socket.io';
import type { ServerContext } from '../context';
import { roomFor } from '@/lib/server/room-keys';
import { canAddCamera, canAddScreen } from '@/lib/server/voice-capacity';
import { validateVoiceSignal } from '@/lib/server/voice-payload';
import { hasRole } from '@/lib/roles';
import { resolveMemberAccess } from '@/lib/channel-access';

export function register(ctx: ServerContext, socket: Socket): void {
  const pubkey = socket.data.pubkey as string;
  const { io, prisma, state, limits } = ctx;

  // PASTE every voice-related socket.on handler from server.ts (JoinVoice,
  // LeaveVoice, VoiceMuteToggle, VoiceDeafenToggle, VoiceCameraStart/Stop,
  // VoiceScreenStart/Stop, ForceVoiceMute/CameraOff/ScreenOff, VoiceSignal,
  // and any ModerateVoice action variants).
  //
  // Replacements to make as you paste:
  //   1. Every reference to a module-level Map (cameraSharers, screenSharers,
  //      voiceSockets, voiceSocketPubkey) → state.cameraSharers etc.
  //   2. Every `MAX_CAMERAS_PER_CHANNEL` → `limits.maxCameras`
  //   3. Every `MAX_SCREENS_PER_CHANNEL` → `limits.maxScreens`
  //   4. Capacity check `if (set.size >= MAX_CAMERAS_PER_CHANNEL && !set.has(pubkey))`
  //      → `if (!canAddCamera(state.cameraSharers, channelId, pubkey, limits))`
  //   5. Same pattern for screens with canAddScreen
  //   6. The VoiceSignal handler — wrap the `socket.on('VoiceSignal', (payload) => {`
  //      body in `if (!validateVoiceSignal(payload)) return;` at the top
  //   7. Every `(globalThis as any).__io` → `io`
  //   8. Every `roomFor.channel(channelId)` instead of inline `\`channel:${channelId}\``
}
```

- [ ] **Step 2: Wire from `server.ts`**

```ts
    const { register: registerVoice } = await import('./server/handlers/voice');
    registerVoice(ctx, socket);
```

Then **delete** the inline voice handler blocks (~653–891).

- [ ] **Step 3: Run tests**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 4: Smoke test voice**

```bash
npm run dev
```

Two tabs as different users:
- Both join the same voice channel
- Confirm bidirectional audio
- Toggle camera — both sides see the video
- Try to start a 5th camera (you'll need 5 sessions or just verify capacity check works by inspecting `voice-capacity.test.ts`)
- One user leaves — the other no longer hears them

Expected: voice works as before. Ctrl-C.

- [ ] **Step 5: Commit**

```bash
git add server/handlers/voice.ts server.ts
git commit -m "refactor(server): move voice handlers into module + use capacity helpers"
```

---

## Task A16: Move disconnect handler + delete `server.ts`

**Files:**
- Create: `server/handlers/disconnect.ts`
- Create: `server/bootstrap/profile-sync.ts`
- Create: `server/bootstrap/bot-poller.ts`
- Create: `server/bootstrap/games.ts`
- Modify: `server/index.ts` (the shim becomes the real entry point)
- Delete: `server.ts`

- [ ] **Step 1: Create `server/handlers/disconnect.ts`**

```ts
// server/handlers/disconnect.ts
// On socket disconnect: clean up voice state (peer-left fan-out), drop
// from pubkeySockets, emit PresenceUpdate offline if no other tabs.
// Must be registered LAST so the cleanup runs after handler-specific work.

import type { Socket } from 'socket.io';
import type { ServerContext } from '../context';
import { roomFor } from '@/lib/server/room-keys';

export function register(ctx: ServerContext, socket: Socket): void {
  const pubkey = socket.data.pubkey as string;
  const { io, state } = ctx;

  socket.on('disconnect', () => {
    // 1. Voice cleanup
    const voiceChannelId = state.voiceSockets.get(socket.id);
    if (voiceChannelId) {
      io.to(roomFor.channel(voiceChannelId)).emit('VoicePeerLeft', { pubkey });
      state.voiceSockets.delete(socket.id);
      state.voiceSocketPubkey.delete(socket.id);
      const cams = state.cameraSharers.get(voiceChannelId);
      cams?.delete(pubkey);
      const screens = state.screenSharers.get(voiceChannelId);
      screens?.delete(pubkey);
    }

    // 2. Drop from pubkeySockets
    const sockets = state.pubkeySockets.get(pubkey);
    if (sockets) {
      sockets.delete(socket.id);
      if (sockets.size === 0) {
        state.pubkeySockets.delete(pubkey);
        io.emit('PresenceUpdate', { pubkey, online: false });
      }
    }
  });
}
```

> **Note:** If the original disconnect block in `server.ts` does additional cleanup (e.g., DB writes for voice state), copy those steps into here. Run `grep -n "socket.on('disconnect'" server.ts` to find the original.

- [ ] **Step 2: Move bootstrap blocks into `server/bootstrap/`**

For each of the three bootstrap concerns at the bottom of `server.ts` (~lines 954–998), create a small module with a single exported `start(ctx)` function.

```ts
// server/bootstrap/profile-sync.ts
import type { ServerContext } from '../context';

export function start(ctx: ServerContext): void {
  // PASTE the profile-sync interval block here. Imports for
  // backfillMissingProfiles / refreshStaleProfiles stay the same.
}
```

```ts
// server/bootstrap/bot-poller.ts
import type { ServerContext } from '../context';

export function start(ctx: ServerContext): void {
  // PASTE the startBotPoller call here.
}
```

```ts
// server/bootstrap/games.ts
import type { ServerContext } from '../context';

export function start(ctx: ServerContext): void {
  // PASTE the scheduleTurnTimer / scheduleWaitingExpiry rehydration here.
}
```

- [ ] **Step 3: Replace `server/index.ts` shim with the real entry point**

```ts
// server/index.ts
// Custom Next.js + Socket.io server entry point.

import next from 'next';
import { createServer } from 'http';
import { createServer as createHttpsServer } from 'https';
import { readFileSync, existsSync } from 'fs';
import { Server as SocketServer } from 'socket.io';
import { parse } from 'url';

import { authMiddleware } from './auth-middleware';
import { createServerContext } from './context';
import { bindContext } from './api-bridge';
import * as presence from './handlers/presence';
import * as rooms from './handlers/rooms';
import * as messages from './handlers/messages';
import * as reactions from './handlers/reactions';
import * as typing from './handlers/typing';
import * as readState from './handlers/read-state';
import * as voice from './handlers/voice';
import * as disconnect from './handlers/disconnect';
import * as profileSync from './bootstrap/profile-sync';
import * as botPoller from './bootstrap/bot-poller';
import * as games from './bootstrap/games';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOST || '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const certPath = './cert.pem';
const keyPath = './key.pem';
const useHttps = dev && existsSync(certPath) && existsSync(keyPath);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  const { prisma } = await import('../src/lib/db-server');

  const requestHandler = (req: any, res: any) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  };

  const httpServer = useHttps
    ? createHttpsServer({ cert: readFileSync(certPath), key: readFileSync(keyPath) }, requestHandler)
    : createServer(requestHandler);

  const io = new SocketServer(httpServer, {
    cors: {
      origin: dev
        ? true
        : process.env.CORS_ORIGIN
          ? [process.env.CORS_ORIGIN]
          : [],
      credentials: true,
    },
  });

  const ctx = createServerContext(io, prisma);
  bindContext(ctx);

  io.use(authMiddleware(ctx));
  io.on('connection', (socket) => {
    presence.register(ctx, socket);
    rooms.register(ctx, socket);
    messages.register(ctx, socket);
    reactions.register(ctx, socket);
    typing.register(ctx, socket);
    readState.register(ctx, socket);
    voice.register(ctx, socket);
    disconnect.register(ctx, socket);
  });

  // Background tasks
  profileSync.start(ctx);
  botPoller.start(ctx);
  games.start(ctx);

  httpServer.listen(port, hostname, () => {
    console.log(`> Ready on ${useHttps ? 'https' : 'http'}://${hostname}:${port}`);
  });
});
```

- [ ] **Step 4: Delete the old `server.ts`**

```bash
git rm server.ts
```

- [ ] **Step 5: Run tests**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 6: Full smoke test**

```bash
npm run dev
```

Walk through every feature one more time:
- Login (NIP-07 + nsec)
- Send / edit / delete a message
- React to a message
- Mention a user — they see the inbox + mention dot + sound
- Send a DM — recipient gets the inbox entry
- Open a channel — unread badge clears
- Voice — join, mute, camera, screen
- Open a second tab — confirm presence sync
- Close the tab — other user sees you go offline

Expected: every feature works identically. Ctrl-C.

- [ ] **Step 7: Update API routes that read `globalThis.__io`**

```bash
grep -rln "globalThis as any).__io\|globalThis\.__io\|__disconnectPubkey\|__emitModEvent" src/
```

For each match, replace with imports from `@/server/api-bridge`:

```ts
// before:
const io = (globalThis as any).__io;
io.to(`server:${id}`).emit('SomeEvent', payload);

// after:
import { emitModEvent } from '@/server/api-bridge';
emitModEvent(id, 'SomeEvent', payload);
```

For force-disconnect uses, swap to `disconnectPubkey(pubkey, reason)`. For arbitrary IO usage, `getIO()` is available.

- [ ] **Step 8: Run tests + smoke moderation flows**

```bash
npm test && npm run dev
```

In the moderation panel, kick / ban / mute a member — confirm the emit reaches the affected client.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor(server): finalize server/ entry point, delete server.ts"
```

---

# PHASE B — Browser Notifications

Phase B builds on the refactored structure. Each task is independent enough to ship in its own commit.

---

## Task B1: NotificationPreference REST endpoint

**Files:**
- Create: `src/app/api/notification-preferences/route.ts`
- Create: `src/app/api/notification-preferences/route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/notification-preferences/route.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GET, PUT, DELETE } from './route';

vi.mock('@/lib/db', () => ({
  prisma: {
    notificationPreference: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock('@/lib/api-auth', () => ({
  requireSession: vi.fn(),
}));

import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/api-auth';

const PUBKEY = 'npub1test';

beforeEach(() => {
  vi.resetAllMocks();
  (requireSession as any).mockResolvedValue({ pubkey: PUBKEY });
});

describe('GET /api/notification-preferences', () => {
  it('returns rows scoped to the authed user', async () => {
    (prisma.notificationPreference.findMany as any).mockResolvedValue([
      { id: '1', pubkey: PUBKEY, scopeType: 'channel', scopeId: 'ch1', notifyLevel: 'nothing', mutedUntil: null },
    ]);
    const res = await GET(new Request('http://x/api/notification-preferences'));
    expect(prisma.notificationPreference.findMany).toHaveBeenCalledWith({ where: { pubkey: PUBKEY } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.prefs).toHaveLength(1);
  });

  it('401 when no session', async () => {
    (requireSession as any).mockRejectedValue(new Error('no session'));
    const res = await GET(new Request('http://x/api/notification-preferences'));
    expect(res.status).toBe(401);
  });
});

describe('PUT /api/notification-preferences', () => {
  it('upserts a row', async () => {
    (prisma.notificationPreference.upsert as any).mockResolvedValue({ id: 'p1' });
    const req = new Request('http://x/api/notification-preferences', {
      method: 'PUT',
      body: JSON.stringify({ scopeType: 'channel', scopeId: 'ch1', notifyLevel: 'nothing' }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await PUT(req);
    expect(res.status).toBe(200);
    expect(prisma.notificationPreference.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { pubkey_scopeType_scopeId: { pubkey: PUBKEY, scopeType: 'channel', scopeId: 'ch1' } },
    }));
  });

  it('rejects invalid scopeType', async () => {
    const req = new Request('http://x/api/notification-preferences', {
      method: 'PUT',
      body: JSON.stringify({ scopeType: 'planet', scopeId: 'p1' }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/notification-preferences', () => {
  it('deletes the row by composite key', async () => {
    (prisma.notificationPreference.delete as any).mockResolvedValue({});
    const req = new Request('http://x/api/notification-preferences', {
      method: 'DELETE',
      body: JSON.stringify({ scopeType: 'channel', scopeId: 'ch1' }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await DELETE(req);
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/app/api/notification-preferences/route.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the route**

```ts
// src/app/api/notification-preferences/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/api-auth';

const VALID_SCOPES = new Set(['server', 'channel', 'dm']);

export async function GET(_req: Request) {
  try {
    const { pubkey } = await requireSession();
    const prefs = await prisma.notificationPreference.findMany({ where: { pubkey } });
    return NextResponse.json({ prefs });
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
}

export async function PUT(req: Request) {
  try {
    const { pubkey } = await requireSession();
    const body = await req.json();
    const { scopeType, scopeId, notifyLevel = null, mutedUntil = null } = body ?? {};
    if (!VALID_SCOPES.has(scopeType) || typeof scopeId !== 'string') {
      return NextResponse.json({ error: 'invalid scope' }, { status: 400 });
    }
    if (notifyLevel !== null && !['all', 'mentions', 'nothing'].includes(notifyLevel)) {
      return NextResponse.json({ error: 'invalid notifyLevel' }, { status: 400 });
    }
    const muted = mutedUntil ? new Date(mutedUntil) : null;
    const pref = await prisma.notificationPreference.upsert({
      where: { pubkey_scopeType_scopeId: { pubkey, scopeType, scopeId } },
      create: { pubkey, scopeType, scopeId, notifyLevel, mutedUntil: muted },
      update: { notifyLevel, mutedUntil: muted },
    });
    return NextResponse.json({ pref });
  } catch (err) {
    if ((err as Error).message?.includes('no session')) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { pubkey } = await requireSession();
    const body = await req.json();
    const { scopeType, scopeId } = body ?? {};
    if (!VALID_SCOPES.has(scopeType) || typeof scopeId !== 'string') {
      return NextResponse.json({ error: 'invalid scope' }, { status: 400 });
    }
    await prisma.notificationPreference.delete({
      where: { pubkey_scopeType_scopeId: { pubkey, scopeType, scopeId } },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if ((err as Error).message?.includes('no session')) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}
```

> **Note:** The Prisma composite unique key name (`pubkey_scopeType_scopeId`) must match the `@@unique` declaration in `prisma/schema.prisma`. Verify with `grep -A2 "@@unique" prisma/schema.prisma | grep -A1 NotificationPreference` — the spec section 11 lists the table with `@@unique([pubkey, scopeType, scopeId])`, which Prisma names `pubkey_scopeType_scopeId`. If your existing `requireSession()` helper has a different signature, adapt — check `src/lib/api-auth.ts`.

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/app/api/notification-preferences/route.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/notification-preferences/route.ts src/app/api/notification-preferences/route.test.ts
git commit -m "feat(notifications): REST endpoints for NotificationPreference CRUD"
```

---

## Task B2: `lib/notifications/prefs.ts` — `resolveScope` pure helper

**Files:**
- Create: `src/lib/notifications/prefs.ts`
- Create: `src/lib/notifications/prefs.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/notifications/prefs.test.ts
import { describe, it, expect } from 'vitest';
import { resolveScope, type ResolvedPref } from './prefs';
import type { ScopeRef } from '@/lib/server/scope-chain';

const NOW = new Date('2026-04-26T12:00:00Z');
const FUTURE = new Date('2026-04-26T20:00:00Z').toISOString();
const PAST = new Date('2026-04-26T08:00:00Z').toISOString();

const channelChain: ScopeRef[] = [
  { type: 'channel', id: 'ch1' },
  { type: 'server', id: 's1' },
];

describe('resolveScope', () => {
  it('returns default when no prefs match', () => {
    const r = resolveScope([], channelChain, NOW);
    expect(r).toEqual<ResolvedPref>({ notifyLevel: 'mentions', mutedUntil: null });
  });

  it('channel-level pref wins over server-level pref', () => {
    const r = resolveScope([
      { id: '1', pubkey: 'x', scopeType: 'server', scopeId: 's1', notifyLevel: 'nothing', mutedUntil: null },
      { id: '2', pubkey: 'x', scopeType: 'channel', scopeId: 'ch1', notifyLevel: 'all', mutedUntil: null },
    ] as any, channelChain, NOW);
    expect(r.notifyLevel).toBe('all');
  });

  it('mute applies when mutedUntil is in the future', () => {
    const r = resolveScope([
      { id: '1', pubkey: 'x', scopeType: 'channel', scopeId: 'ch1', notifyLevel: null, mutedUntil: FUTURE },
    ] as any, channelChain, NOW);
    expect(r.mutedUntil).toEqual(new Date(FUTURE));
  });

  it('mute does NOT apply when mutedUntil has passed', () => {
    const r = resolveScope([
      { id: '1', pubkey: 'x', scopeType: 'channel', scopeId: 'ch1', notifyLevel: null, mutedUntil: PAST },
    ] as any, channelChain, NOW);
    expect(r.mutedUntil).toBeNull();
  });

  it('server-level mute inherits to channel when channel has no override', () => {
    const r = resolveScope([
      { id: '1', pubkey: 'x', scopeType: 'server', scopeId: 's1', notifyLevel: null, mutedUntil: FUTURE },
    ] as any, channelChain, NOW);
    expect(r.mutedUntil).toEqual(new Date(FUTURE));
  });

  it('DM scope chain resolves dm-type prefs', () => {
    const r = resolveScope([
      { id: '1', pubkey: 'x', scopeType: 'dm', scopeId: 'npub_alice', notifyLevel: 'nothing', mutedUntil: null },
    ] as any, [{ type: 'dm', id: 'npub_alice' }], NOW);
    expect(r.notifyLevel).toBe('nothing');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/notifications/prefs.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/lib/notifications/prefs.ts`**

```ts
// src/lib/notifications/prefs.ts
// Pure resolver. Walks the scope chain most-specific → least-specific and
// composes a single ResolvedPref. NotifyLevel and mutedUntil resolve
// independently — a channel can have notifyLevel='all' AND a parent server
// muted; both fields surface on the result.

import type { ScopeRef } from '@/lib/server/scope-chain';

export interface NotificationPreference {
  id: string;
  pubkey: string;
  scopeType: 'server' | 'channel' | 'dm' | string;
  scopeId: string;
  notifyLevel: 'all' | 'mentions' | 'nothing' | null;
  mutedUntil: string | Date | null;
}

export interface ResolvedPref {
  notifyLevel: 'all' | 'mentions' | 'nothing';
  mutedUntil: Date | null;
}

const DEFAULT: ResolvedPref = { notifyLevel: 'mentions', mutedUntil: null };

function findPref(
  prefs: NotificationPreference[],
  scope: ScopeRef,
): NotificationPreference | undefined {
  return prefs.find((p) => p.scopeType === scope.type && p.scopeId === scope.id);
}

export function resolveScope(
  prefs: NotificationPreference[],
  scopeChain: ScopeRef[],
  now: Date = new Date(),
): ResolvedPref {
  let notifyLevel: ResolvedPref['notifyLevel'] | null = null;
  let mutedUntil: Date | null = null;

  for (const scope of scopeChain) {
    const pref = findPref(prefs, scope);
    if (!pref) continue;
    if (notifyLevel === null && pref.notifyLevel) {
      notifyLevel = pref.notifyLevel;
    }
    if (!mutedUntil && pref.mutedUntil) {
      const until = pref.mutedUntil instanceof Date ? pref.mutedUntil : new Date(pref.mutedUntil);
      if (until > now) mutedUntil = until;
    }
  }

  return {
    notifyLevel: notifyLevel ?? DEFAULT.notifyLevel,
    mutedUntil,
  };
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/lib/notifications/prefs.test.ts
```

Expected: PASS, 6/6.

- [ ] **Step 5: Commit**

```bash
git add src/lib/notifications/prefs.ts src/lib/notifications/prefs.test.ts
git commit -m "feat(notifications): pure resolveScope walking the scope chain"
```

---

## Task B3: `lib/notifications/suppression.ts` — `shouldSuppress` pure helper

**Files:**
- Create: `src/lib/notifications/suppression.ts`
- Create: `src/lib/notifications/suppression.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/notifications/suppression.test.ts
import { describe, it, expect } from 'vitest';
import { shouldSuppress, type SuppressionContext, type NotificationPayload } from './suppression';

const VIEWER = 'npub_me';

const baseCtx: SuppressionContext = {
  viewerPubkey: VIEWER,
  documentVisible: false,
  windowFocused: false,
  activeChannelId: null,
  activePostId: null,
  scrolledToBottom: false,
  resolvedPref: { notifyLevel: 'mentions', mutedUntil: null },
};

const basePayload: NotificationPayload = {
  recipientPubkey: VIEWER,
  type: 'mention',
  channelId: 'ch1',
  serverId: 's1',
  senderPubkey: 'npub_alice',
  preview: 'hi',
  createdAt: new Date().toISOString(),
  scopeChain: [{ type: 'channel', id: 'ch1' }, { type: 'server', id: 's1' }],
};

describe('shouldSuppress', () => {
  it('does NOT suppress a mention from a stranger when tab is hidden', () => {
    expect(shouldSuppress(basePayload, baseCtx)).toBe(false);
  });

  it('suppresses when actively reading the same channel', () => {
    expect(shouldSuppress(basePayload, {
      ...baseCtx,
      documentVisible: true,
      windowFocused: true,
      activeChannelId: 'ch1',
      scrolledToBottom: true,
    })).toBe(true);
  });

  it('does NOT suppress when in the channel but window is unfocused', () => {
    expect(shouldSuppress(basePayload, {
      ...baseCtx,
      documentVisible: true,
      windowFocused: false,
      activeChannelId: 'ch1',
      scrolledToBottom: true,
    })).toBe(false);
  });

  it('does NOT suppress when in the channel but scrolled up', () => {
    expect(shouldSuppress(basePayload, {
      ...baseCtx,
      documentVisible: true,
      windowFocused: true,
      activeChannelId: 'ch1',
      scrolledToBottom: false,
    })).toBe(false);
  });

  it('suppresses muted scope', () => {
    expect(shouldSuppress(basePayload, {
      ...baseCtx,
      resolvedPref: { notifyLevel: 'mentions', mutedUntil: new Date(Date.now() + 60_000) },
    })).toBe(true);
  });

  it('suppresses notifyLevel=nothing', () => {
    expect(shouldSuppress(basePayload, {
      ...baseCtx,
      resolvedPref: { notifyLevel: 'nothing', mutedUntil: null },
    })).toBe(true);
  });

  it('suppresses own-message echo (defensive)', () => {
    expect(shouldSuppress({ ...basePayload, senderPubkey: VIEWER }, baseCtx)).toBe(true);
  });

  it('suppresses forum reply when in same channel and same post', () => {
    expect(shouldSuppress(
      { ...basePayload, type: 'reply', postId: 'p1' },
      { ...baseCtx, documentVisible: true, windowFocused: true, activeChannelId: 'ch1', activePostId: 'p1', scrolledToBottom: true },
    )).toBe(true);
  });

  it('does NOT suppress forum reply when in same channel but different post', () => {
    expect(shouldSuppress(
      { ...basePayload, type: 'reply', postId: 'p1' },
      { ...baseCtx, documentVisible: true, windowFocused: true, activeChannelId: 'ch1', activePostId: 'p2', scrolledToBottom: true },
    )).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/notifications/suppression.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/lib/notifications/suppression.ts`**

```ts
// src/lib/notifications/suppression.ts
// Pure: should we suppress the OS popup + sound for this notification?
// Three suppression rules:
//   1. Actively reading: visible + focused + same channel/post + at bottom
//   2. Muted (scope-resolved) or notifyLevel=nothing
//   3. Own-message echo (sender = viewer)

import type { ScopeRef } from '@/lib/server/scope-chain';
import type { ResolvedPref } from './prefs';

export interface NotificationPayload {
  recipientPubkey: string;
  type: 'mention' | 'reply' | 'everyone' | 'dm';
  serverId?: string;
  channelId?: string;
  postId?: string;
  messageId?: string;
  senderPubkey: string;
  preview?: string;
  createdAt: string;
  scopeChain: ScopeRef[];
  senderName?: string;
}

export interface SuppressionContext {
  viewerPubkey: string;
  documentVisible: boolean;
  windowFocused: boolean;
  activeChannelId: string | null;
  activePostId: string | null;
  scrolledToBottom: boolean;
  resolvedPref: ResolvedPref;
}

export function shouldSuppress(
  p: NotificationPayload,
  ctx: SuppressionContext,
): boolean {
  // 3. Own-message echo
  if (p.senderPubkey === ctx.viewerPubkey) return true;

  // 2. Muted / nothing
  if (ctx.resolvedPref.notifyLevel === 'nothing') return true;
  if (ctx.resolvedPref.mutedUntil && ctx.resolvedPref.mutedUntil > new Date()) return true;

  // 1. Actively reading
  const inChannel =
    ctx.documentVisible &&
    ctx.windowFocused &&
    ctx.activeChannelId !== null &&
    ctx.activeChannelId === p.channelId &&
    ctx.scrolledToBottom;
  const samePostOrChannelOnly =
    !p.postId || p.postId === ctx.activePostId;
  if (inChannel && samePostOrChannelOnly) return true;

  return false;
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/lib/notifications/suppression.test.ts
```

Expected: PASS, 9/9.

- [ ] **Step 5: Commit**

```bash
git add src/lib/notifications/suppression.ts src/lib/notifications/suppression.test.ts
git commit -m "feat(notifications): pure shouldSuppress with active-reading + mute + echo rules"
```

---

## Task B4: `lib/notifications/permission.ts` — browser permission state machine

**Files:**
- Create: `src/lib/notifications/permission.ts`
- Create: `src/lib/notifications/permission.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/notifications/permission.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readPermission, requestPermission, isSoftPromptEligible } from './permission';

const SESSION_START = 1_700_000_000_000;
const ONE_MIN_LATER = SESSION_START + 60_000;

beforeEach(() => {
  // jsdom does not implement Notification — provide a controllable stub.
  (globalThis as any).Notification = {
    permission: 'default' as NotificationPermission,
    requestPermission: vi.fn().mockResolvedValue('granted' as NotificationPermission),
  };
  globalThis.localStorage.clear();
});

describe('readPermission', () => {
  it('returns "unsupported" when Notification is missing', () => {
    delete (globalThis as any).Notification;
    expect(readPermission()).toBe('unsupported');
  });

  it('returns the current Notification.permission', () => {
    (globalThis as any).Notification.permission = 'granted';
    expect(readPermission()).toBe('granted');
  });
});

describe('requestPermission', () => {
  it('calls Notification.requestPermission and returns the result', async () => {
    const result = await requestPermission();
    expect((globalThis as any).Notification.requestPermission).toHaveBeenCalled();
    expect(result).toBe('granted');
  });

  it('returns "unsupported" when Notification is missing', async () => {
    delete (globalThis as any).Notification;
    expect(await requestPermission()).toBe('unsupported');
  });
});

describe('isSoftPromptEligible', () => {
  it('eligible when permission=default, ≥60s, not dismissed', () => {
    expect(isSoftPromptEligible({
      permission: 'default',
      sessionStartedAt: SESSION_START,
      now: ONE_MIN_LATER,
      sessionDismissed: false,
      permanentlyDismissed: false,
    })).toBe(true);
  });

  it('not eligible before 60s', () => {
    expect(isSoftPromptEligible({
      permission: 'default',
      sessionStartedAt: SESSION_START,
      now: SESSION_START + 30_000,
      sessionDismissed: false,
      permanentlyDismissed: false,
    })).toBe(false);
  });

  it('not eligible when permission=granted', () => {
    expect(isSoftPromptEligible({
      permission: 'granted',
      sessionStartedAt: SESSION_START,
      now: ONE_MIN_LATER,
      sessionDismissed: false,
      permanentlyDismissed: false,
    })).toBe(false);
  });

  it('not eligible when permission=denied', () => {
    expect(isSoftPromptEligible({
      permission: 'denied',
      sessionStartedAt: SESSION_START,
      now: ONE_MIN_LATER,
      sessionDismissed: false,
      permanentlyDismissed: false,
    })).toBe(false);
  });

  it('not eligible when session-dismissed', () => {
    expect(isSoftPromptEligible({
      permission: 'default',
      sessionStartedAt: SESSION_START,
      now: ONE_MIN_LATER,
      sessionDismissed: true,
      permanentlyDismissed: false,
    })).toBe(false);
  });

  it('not eligible when permanently dismissed', () => {
    expect(isSoftPromptEligible({
      permission: 'default',
      sessionStartedAt: SESSION_START,
      now: ONE_MIN_LATER,
      sessionDismissed: false,
      permanentlyDismissed: true,
    })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/notifications/permission.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/lib/notifications/permission.ts`**

```ts
// src/lib/notifications/permission.ts
// Browser Notification permission state machine + soft-prompt eligibility.
// We never call Notification.requestPermission() automatically — only on
// explicit user click — because browsers penalize sites that auto-prompt
// and once denied recovery requires the user to find the site settings.

const PERMA_DISMISS_KEY = 'obelisk:notif-prompt-dismissed';

export type PermissionState = 'unsupported' | NotificationPermission;

export function readPermission(): PermissionState {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

export async function requestPermission(): Promise<PermissionState> {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.requestPermission();
}

export function isPermanentlyDismissed(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(PERMA_DISMISS_KEY) === 'true';
}

export function setPermanentlyDismissed(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(PERMA_DISMISS_KEY, 'true');
}

export interface SoftPromptInput {
  permission: PermissionState;
  sessionStartedAt: number;
  now: number;
  sessionDismissed: boolean;
  permanentlyDismissed: boolean;
}

export function isSoftPromptEligible(i: SoftPromptInput): boolean {
  if (i.permission !== 'default') return false;
  if (i.now - i.sessionStartedAt < 60_000) return false;
  if (i.sessionDismissed) return false;
  if (i.permanentlyDismissed) return false;
  return true;
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/lib/notifications/permission.test.ts
```

Expected: PASS, 8/8.

- [ ] **Step 5: Commit**

```bash
git add src/lib/notifications/permission.ts src/lib/notifications/permission.test.ts
git commit -m "feat(notifications): permission state machine + soft-prompt eligibility"
```

---

## Task B5: `lib/notifications/index.ts` — `NotificationCenter.notify`

**Files:**
- Create: `src/lib/notifications/index.ts`
- Create: `src/lib/notifications/index.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/notifications/index.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotificationCenter } from './index';
import type { NotificationPayload } from './suppression';

const VIEWER = 'npub_me';

const basePayload: NotificationPayload = {
  recipientPubkey: VIEWER,
  type: 'mention',
  channelId: 'ch1',
  serverId: 's1',
  messageId: 'm1',
  senderPubkey: 'npub_alice',
  senderName: 'Alice',
  preview: 'hey check this out',
  createdAt: new Date().toISOString(),
  scopeChain: [{ type: 'channel', id: 'ch1' }, { type: 'server', id: 's1' }],
};

let lastNotification: { title: string; opts: NotificationOptions } | null = null;
let soundPlayed = false;

beforeEach(() => {
  lastNotification = null;
  soundPlayed = false;
  (globalThis as any).Notification = vi.fn().mockImplementation((title: string, opts: NotificationOptions) => {
    lastNotification = { title, opts };
    return { close: vi.fn() };
  });
  (globalThis as any).Notification.permission = 'granted';
  globalThis.localStorage?.clear?.();
});

const ctxAlwaysShow = {
  viewerPubkey: VIEWER,
  prefs: [],
  channelNameById: (id: string) => id === 'ch1' ? 'general' : id,
  isActiveContext: () => false,
  resolveSuppressionContext: () => ({
    viewerPubkey: VIEWER,
    documentVisible: false,
    windowFocused: false,
    activeChannelId: null,
    activePostId: null,
    scrolledToBottom: false,
    resolvedPref: { notifyLevel: 'mentions' as const, mutedUntil: null },
  }),
  playSound: () => { soundPlayed = true; },
};

describe('NotificationCenter.notify', () => {
  it('shows OS notification with channel-style title for channel mention', () => {
    NotificationCenter.notify(basePayload, ctxAlwaysShow);
    expect(lastNotification?.title).toBe('#general');
    expect(lastNotification?.opts.body).toBe('hey check this out');
    expect(lastNotification?.opts.tag).toBe('ch1');
    expect(soundPlayed).toBe(true);
  });

  it('uses sender name as title for DMs', () => {
    NotificationCenter.notify({
      ...basePayload,
      type: 'dm',
      channelId: undefined,
      serverId: undefined,
      scopeChain: [{ type: 'dm', id: 'npub_alice' }],
    }, ctxAlwaysShow);
    expect(lastNotification?.title).toBe('Alice');
    expect(lastNotification?.opts.tag).toBe('npub_alice');
  });

  it('uses "sender in #channel" title for forum replies', () => {
    NotificationCenter.notify({
      ...basePayload,
      type: 'reply',
      postId: 'p1',
    }, ctxAlwaysShow);
    expect(lastNotification?.title).toBe('Alice in #general');
    expect(lastNotification?.opts.tag).toBe('p1');
  });

  it('skips notification + sound when suppressed', () => {
    NotificationCenter.notify(basePayload, {
      ...ctxAlwaysShow,
      resolveSuppressionContext: () => ({
        viewerPubkey: VIEWER,
        documentVisible: true,
        windowFocused: true,
        activeChannelId: 'ch1',
        activePostId: null,
        scrolledToBottom: true,
        resolvedPref: { notifyLevel: 'mentions', mutedUntil: null },
      }),
    });
    expect(lastNotification).toBeNull();
    expect(soundPlayed).toBe(false);
  });

  it('skips when permission is not granted', () => {
    (globalThis as any).Notification.permission = 'default';
    NotificationCenter.notify(basePayload, ctxAlwaysShow);
    expect(lastNotification).toBeNull();
    // Sound is independent of OS permission (still played in WhatsApp model)
    expect(soundPlayed).toBe(true);
  });

  it('skips sound when sound preference is off', () => {
    globalThis.localStorage.setItem('obelisk:notif-sound-enabled', 'false');
    NotificationCenter.notify(basePayload, ctxAlwaysShow);
    expect(soundPlayed).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/notifications/index.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/lib/notifications/index.ts`**

```ts
// src/lib/notifications/index.ts
// NotificationCenter — composes the suppression check, OS popup, and sound
// into a single entry point called from useSocketLifecycle's Notification
// handler. Exposes a small dependency-injectable surface so tests can
// substitute the channel-name lookup, the sound function, and the active-
// context resolver.

import { shouldSuppress, type NotificationPayload, type SuppressionContext } from './suppression';
import type { NotificationPreference } from './prefs';

const SOUND_PREF_KEY = 'obelisk:notif-sound-enabled';

export interface NotifyContext {
  viewerPubkey: string;
  prefs: NotificationPreference[];
  /** Lookup channel display name for the OS notification title. */
  channelNameById: (channelId: string) => string;
  /** Resolved scope/active-reading context for suppression. */
  resolveSuppressionContext: (payload: NotificationPayload) => SuppressionContext;
  /** Plays the mention sound. Injected for testability. */
  playSound: () => void;
}

function buildTitle(p: NotificationPayload, channelName: string | undefined): string {
  if (p.type === 'dm') return p.senderName ?? p.senderPubkey.slice(0, 16);
  if (p.type === 'reply' && p.senderName && channelName) {
    return `${p.senderName} in #${channelName}`;
  }
  return channelName ? `#${channelName}` : (p.senderName ?? 'Notification');
}

function buildTag(p: NotificationPayload): string {
  return p.postId ?? p.channelId ?? p.senderPubkey;
}

function isSoundEnabled(): boolean {
  if (typeof localStorage === 'undefined') return true;
  return localStorage.getItem(SOUND_PREF_KEY) !== 'false';
}

export const NotificationCenter = {
  notify(payload: NotificationPayload, ctx: NotifyContext): void {
    const suppressionCtx = ctx.resolveSuppressionContext(payload);
    const suppressed = shouldSuppress(payload, suppressionCtx);
    if (suppressed) return;

    if (isSoundEnabled()) ctx.playSound();

    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;

    const channelName = payload.channelId ? ctx.channelNameById(payload.channelId) : undefined;
    const title = buildTitle(payload, channelName);
    const opts: NotificationOptions = {
      body: payload.preview ?? '',
      tag: buildTag(payload),
      icon: '/favicon.ico',
      silent: true, // we play our own sound
      data: {
        channelId: payload.channelId,
        serverId: payload.serverId,
        postId: payload.postId,
        messageId: payload.messageId,
      },
    };
    try {
      new Notification(title, opts);
    } catch {
      // Older Safari may throw on `silent: true`; ignore.
    }
  },
};

export type { NotificationPayload, SuppressionContext };
```

> **Note:** The test for "skips when permission is not granted" expects sound to still play. That matches the WhatsApp/spec model — sound and OS popup are independent surfaces. The sound runs before the permission check.

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/lib/notifications/index.test.ts
```

Expected: PASS, 6/6.

- [ ] **Step 5: Commit**

```bash
git add src/lib/notifications/index.ts src/lib/notifications/index.test.ts
git commit -m "feat(notifications): NotificationCenter.notify composing OS popup + sound + suppression"
```

---

## Task B6: `store/notificationPrefs.ts` — Zustand store with optimistic updates

**Files:**
- Create: `src/store/notificationPrefs.ts`
- Create: `src/store/notificationPrefs.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/store/notificationPrefs.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useNotificationPrefsStore } from './notificationPrefs';

const PUBKEY = 'npub_me';

beforeEach(() => {
  useNotificationPrefsStore.setState({ prefs: [], hydrated: false });
  globalThis.fetch = vi.fn();
});

describe('useNotificationPrefsStore', () => {
  it('hydrate fetches and stores prefs', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ prefs: [
        { id: '1', pubkey: PUBKEY, scopeType: 'channel', scopeId: 'ch1', notifyLevel: 'nothing', mutedUntil: null },
      ] }),
    });
    await useNotificationPrefsStore.getState().hydrate();
    const s = useNotificationPrefsStore.getState();
    expect(s.hydrated).toBe(true);
    expect(s.prefs).toHaveLength(1);
  });

  it('setPref updates optimistically and rolls back on API error', async () => {
    useNotificationPrefsStore.setState({ prefs: [], hydrated: true });
    (globalThis.fetch as any).mockResolvedValue({ ok: false });

    const before = useNotificationPrefsStore.getState().prefs.length;
    await useNotificationPrefsStore.getState()
      .setPref({ type: 'channel', id: 'ch1' }, { notifyLevel: 'all' })
      .catch(() => {});
    // After rollback, list should be unchanged
    expect(useNotificationPrefsStore.getState().prefs.length).toBe(before);
  });

  it('setPref keeps the row on success', async () => {
    useNotificationPrefsStore.setState({ prefs: [], hydrated: true });
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ pref: { id: 'srv', pubkey: PUBKEY, scopeType: 'channel', scopeId: 'ch1', notifyLevel: 'all', mutedUntil: null } }),
    });
    await useNotificationPrefsStore.getState().setPref({ type: 'channel', id: 'ch1' }, { notifyLevel: 'all' });
    const s = useNotificationPrefsStore.getState();
    expect(s.prefs).toHaveLength(1);
    expect(s.prefs[0].notifyLevel).toBe('all');
  });

  it('resetPref removes the row optimistically', async () => {
    useNotificationPrefsStore.setState({
      prefs: [{ id: '1', pubkey: PUBKEY, scopeType: 'channel', scopeId: 'ch1', notifyLevel: 'nothing', mutedUntil: null }],
      hydrated: true,
    });
    (globalThis.fetch as any).mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    await useNotificationPrefsStore.getState().resetPref({ type: 'channel', id: 'ch1' });
    expect(useNotificationPrefsStore.getState().prefs).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/store/notificationPrefs.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/store/notificationPrefs.ts`**

```ts
// src/store/notificationPrefs.ts
// Zustand store for NotificationPreference rows. Hydrated once on login,
// then updated optimistically with API rollback on failure.

import { create } from 'zustand';
import { resolveScope, type NotificationPreference, type ResolvedPref } from '@/lib/notifications/prefs';
import type { ScopeRef } from '@/lib/server/scope-chain';

const ENDPOINT = '/api/notification-preferences';

export interface PrefPatch {
  notifyLevel?: 'all' | 'mentions' | 'nothing' | null;
  mutedUntil?: string | null;
}

interface NotificationPrefsState {
  prefs: NotificationPreference[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setPref: (scope: ScopeRef, patch: PrefPatch) => Promise<void>;
  resetPref: (scope: ScopeRef) => Promise<void>;
  resolve: (scopeChain: ScopeRef[]) => ResolvedPref;
}

function findIndex(prefs: NotificationPreference[], scope: ScopeRef): number {
  return prefs.findIndex((p) => p.scopeType === scope.type && p.scopeId === scope.id);
}

export const useNotificationPrefsStore = create<NotificationPrefsState>((set, get) => ({
  prefs: [],
  hydrated: false,

  hydrate: async () => {
    const res = await fetch(ENDPOINT, { credentials: 'include' });
    if (!res.ok) {
      set({ hydrated: true });
      return;
    }
    const body = await res.json();
    set({ prefs: body.prefs ?? [], hydrated: true });
  },

  setPref: async (scope, patch) => {
    const before = get().prefs;
    const optimistic: NotificationPreference = {
      id: `tmp_${scope.type}_${scope.id}`,
      pubkey: '',
      scopeType: scope.type,
      scopeId: scope.id,
      notifyLevel: patch.notifyLevel ?? null,
      mutedUntil: patch.mutedUntil ?? null,
    };
    const idx = findIndex(before, scope);
    const next = idx === -1
      ? [...before, optimistic]
      : before.map((p, i) => i === idx ? { ...p, ...patch } : p);
    set({ prefs: next });

    const res = await fetch(ENDPOINT, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scopeType: scope.type, scopeId: scope.id, ...patch }),
    });
    if (!res.ok) {
      set({ prefs: before });
      throw new Error('failed to save preference');
    }
    const body = await res.json();
    if (body.pref) {
      set({
        prefs: get().prefs.map((p) => (p.scopeType === scope.type && p.scopeId === scope.id ? body.pref : p)),
      });
    }
  },

  resetPref: async (scope) => {
    const before = get().prefs;
    set({ prefs: before.filter((p) => !(p.scopeType === scope.type && p.scopeId === scope.id)) });
    const res = await fetch(ENDPOINT, {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scopeType: scope.type, scopeId: scope.id }),
    });
    if (!res.ok) {
      set({ prefs: before });
      throw new Error('failed to delete preference');
    }
  },

  resolve: (scopeChain) => resolveScope(get().prefs, scopeChain),
}));
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/store/notificationPrefs.test.ts
```

Expected: PASS, 4/4.

- [ ] **Step 5: Commit**

```bash
git add src/store/notificationPrefs.ts src/store/notificationPrefs.test.ts
git commit -m "feat(notifications): Zustand store with optimistic updates + rollback"
```

---

## Task B7: Wire `NotificationCenter.notify` into `useSocketLifecycle`

**Files:**
- Modify: `src/hooks/chat/useSocketLifecycle.ts` (the `socket.on(ServerToClient.Notification, ...)` block, ~line 291)

- [ ] **Step 1: Open the existing handler**

Locate the block in `src/hooks/chat/useSocketLifecycle.ts` that begins with `socket.on(ServerToClient.Notification, ...)`. Today it imports `playMentionSound` and unconditionally invokes it for `isMentionLike` payloads.

- [ ] **Step 2: Replace the call with `NotificationCenter.notify`**

Add the import:

```ts
import { NotificationCenter } from '@/lib/notifications';
import { useNotificationPrefsStore } from '@/store/notificationPrefs';
import { playMentionSound } from '@/lib/mentionSound';
import { useChatStore } from '@/store/chat';
```

Then inside the `socket.on(ServerToClient.Notification, (data) => { ... })` body, **after** the existing inbox/mention-dot logic, add a single call:

```ts
NotificationCenter.notify(data as any, {
  viewerPubkey: profilePubkeyRef.current ?? '',
  prefs: useNotificationPrefsStore.getState().prefs,
  channelNameById: (id) => {
    const ch = useChatStore.getState().channels.find((c) => c.id === id);
    return ch?.name ?? id;
  },
  resolveSuppressionContext: (payload) => {
    const isWatching = isUserWatchingChannel(payload.channelId ?? '');
    const isPostMatch =
      !payload.postId || useChatStore.getState().activePostId === payload.postId;
    return {
      viewerPubkey: profilePubkeyRef.current ?? '',
      documentVisible: typeof document !== 'undefined' && document.visibilityState === 'visible',
      windowFocused: typeof document !== 'undefined' && document.hasFocus(),
      activeChannelId: activeChannelIdRef.current ?? null,
      activePostId: useChatStore.getState().activePostId ?? null,
      scrolledToBottom: useChatStore.getState().scrolledToBottom ?? false,
      resolvedPref: useNotificationPrefsStore.getState().resolve(
        (payload.scopeChain && payload.scopeChain.length > 0)
          ? payload.scopeChain
          : payload.channelId
            ? [{ type: 'channel', id: payload.channelId }]
            : []
      ),
    };
  },
  playSound: playMentionSound,
});
```

**Remove** the existing direct `playMentionSound()` call inside the handler — it's now invoked from inside `NotificationCenter.notify()` so muted channels stop beeping.

> **Note:** Adapt to your codebase's actual variable names — `profilePubkeyRef`, `activeChannelIdRef`, `isUserWatchingChannel`, and `scrolledToBottom` exist in this file already. If `scrolledToBottom` doesn't exist on `useChatStore`, default to `false` and accept that mentions in the active channel will pop a notification (mild over-notification is better than missing one). Track adding it as a TODO.

- [ ] **Step 3: Hydrate the prefs store on login**

Find the login completion path — likely `src/store/auth.ts` or wherever `setBulkUnreads` is called after successful login. Add:

```ts
import { useNotificationPrefsStore } from '@/store/notificationPrefs';
// ...after existing post-login hydration:
void useNotificationPrefsStore.getState().hydrate();
```

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: all pass. Existing useSocketLifecycle tests should not regress; the change is additive.

- [ ] **Step 5: Smoke test**

```bash
npm run dev
```

In two browsers as different users, mention each other. The receiving user — once they click "Enable" in the next task's banner OR manually grant in browser settings — should see an OS notification.

For now (without the banner), grant permission manually:
- In Chrome DevTools → Application → Storage → site permissions → set Notifications to "Allow"
- Then trigger a mention — OS notification should appear.

If permission is `default`, the OS popup won't fire (expected) but the inbox + mention dot still work.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/chat/useSocketLifecycle.ts src/store/auth.ts
git commit -m "feat(notifications): wire NotificationCenter.notify into Notification socket handler"
```

---

## Task B8: `<NotifyMenu>` component

**Files:**
- Create: `src/components/notifications/NotifyMenu.tsx`
- Create: `src/components/notifications/NotifyMenu.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/notifications/NotifyMenu.test.tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NotifyMenu } from './NotifyMenu';
import { useNotificationPrefsStore } from '@/store/notificationPrefs';

beforeEach(() => {
  useNotificationPrefsStore.setState({ prefs: [], hydrated: true });
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ pref: null }),
  });
});

describe('NotifyMenu', () => {
  it('renders default state when no pref exists', () => {
    render(<NotifyMenu scope={{ type: 'channel', id: 'ch1' }} title="general" onClose={() => {}} />);
    expect(screen.getByText(/Notifications for #general/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Default \(mentions only\)/i)).toBeChecked();
  });

  it('writes notifyLevel through the store on click', async () => {
    const setPrefSpy = vi.spyOn(useNotificationPrefsStore.getState(), 'setPref');
    render(<NotifyMenu scope={{ type: 'channel', id: 'ch1' }} title="general" onClose={() => {}} />);
    fireEvent.click(screen.getByLabelText(/All messages/i));
    expect(setPrefSpy).toHaveBeenCalledWith({ type: 'channel', id: 'ch1' }, expect.objectContaining({ notifyLevel: 'all' }));
  });

  it('writes mutedUntil when a duration is picked', () => {
    const setPrefSpy = vi.spyOn(useNotificationPrefsStore.getState(), 'setPref');
    render(<NotifyMenu scope={{ type: 'channel', id: 'ch1' }} title="general" onClose={() => {}} />);
    fireEvent.click(screen.getByLabelText(/8 hours/i));
    const arg = setPrefSpy.mock.calls[0][1];
    expect(arg.mutedUntil).toBeTruthy();
    expect(new Date(arg.mutedUntil!).getTime()).toBeGreaterThan(Date.now());
  });

  it('reset button calls resetPref', () => {
    const resetSpy = vi.spyOn(useNotificationPrefsStore.getState(), 'resetPref');
    render(<NotifyMenu scope={{ type: 'channel', id: 'ch1' }} title="general" onClose={() => {}} />);
    fireEvent.click(screen.getByText(/Reset to default/i));
    expect(resetSpy).toHaveBeenCalledWith({ type: 'channel', id: 'ch1' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/components/notifications/NotifyMenu.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/components/notifications/NotifyMenu.tsx`**

```tsx
// src/components/notifications/NotifyMenu.tsx
'use client';

import { useNotificationPrefsStore } from '@/store/notificationPrefs';
import type { ScopeRef } from '@/lib/server/scope-chain';

interface NotifyMenuProps {
  scope: ScopeRef;
  title: string;             // display name without prefix (no '#'); we add the prefix
  onClose: () => void;
}

const DURATIONS: Array<{ label: string; minutes: number | 'forever' }> = [
  { label: '15 minutes', minutes: 15 },
  { label: '1 hour', minutes: 60 },
  { label: '8 hours', minutes: 60 * 8 },
  { label: '24 hours', minutes: 60 * 24 },
  { label: 'Until I turn it back on', minutes: 'forever' },
];

const FOREVER_DATE = '9999-12-31T23:59:59.999Z';

function durationToTimestamp(minutes: number | 'forever'): string {
  if (minutes === 'forever') return FOREVER_DATE;
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

export function NotifyMenu({ scope, title, onClose }: NotifyMenuProps) {
  const prefs = useNotificationPrefsStore((s) => s.prefs);
  const setPref = useNotificationPrefsStore((s) => s.setPref);
  const resetPref = useNotificationPrefsStore((s) => s.resetPref);
  const current = prefs.find((p) => p.scopeType === scope.type && p.scopeId === scope.id);

  const headerPrefix = scope.type === 'channel' ? '#' : '';
  const currentLevel = current?.notifyLevel ?? null;

  const handleLevel = (level: 'all' | 'mentions' | 'nothing' | null) => {
    void setPref(scope, { notifyLevel: level });
  };

  const handleMute = (minutes: number | 'forever') => {
    void setPref(scope, { mutedUntil: durationToTimestamp(minutes) });
  };

  const handleReset = () => {
    void resetPref(scope);
    onClose();
  };

  return (
    <div className="lc-card p-4 w-72" role="dialog" aria-label="Notification settings">
      <div className="text-sm font-medium mb-3">
        Notifications for {headerPrefix}{title}
      </div>

      <fieldset className="mb-4">
        <legend className="sr-only">Notification level</legend>
        <label className="flex items-center gap-2 py-1 cursor-pointer">
          <input type="radio" name="lvl" checked={currentLevel === null} onChange={() => handleLevel(null)} />
          <span>Default (mentions only)</span>
        </label>
        <label className="flex items-center gap-2 py-1 cursor-pointer">
          <input type="radio" name="lvl" checked={currentLevel === 'all'} onChange={() => handleLevel('all')} />
          <span>All messages</span>
        </label>
        <label className="flex items-center gap-2 py-1 cursor-pointer">
          <input type="radio" name="lvl" checked={currentLevel === 'nothing'} onChange={() => handleLevel('nothing')} />
          <span>Nothing</span>
        </label>
      </fieldset>

      <div className="border-t border-lc-border my-2" />

      <fieldset className="mb-4">
        <legend className="text-xs uppercase tracking-wide text-lc-muted mb-1">Mute for</legend>
        {DURATIONS.map((d) => (
          <label key={d.label} className="flex items-center gap-2 py-1 cursor-pointer">
            <input type="radio" name="mute" onChange={() => handleMute(d.minutes)} />
            <span>{d.label}</span>
          </label>
        ))}
      </fieldset>

      <div className="border-t border-lc-border my-2" />

      <button className="lc-pill-secondary text-sm w-full" onClick={handleReset}>
        Reset to default
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/components/notifications/NotifyMenu.test.tsx
```

Expected: PASS, 4/4.

- [ ] **Step 5: Commit**

```bash
git add src/components/notifications/NotifyMenu.tsx src/components/notifications/NotifyMenu.test.tsx
git commit -m "feat(notifications): NotifyMenu popover for channel + server scopes"
```

---

## Task B9: Bell icon in channel header

**Files:**
- Modify: `src/components/chat/MessageArea.tsx` (the channel-header section)

- [ ] **Step 1: Open `MessageArea.tsx` and find the channel header**

Look for the section that renders the channel name at the top of the message area. There's likely a `<header>` or `<div className="lc-...">` with the channel `#name`.

- [ ] **Step 2: Add the bell icon next to the channel name**

```tsx
// At the top of the file:
import { useState } from 'react';
import { NotifyMenu } from '@/components/notifications/NotifyMenu';
import { useNotificationPrefsStore } from '@/store/notificationPrefs';

// ...inside the component, near where channel.id and channel.name are in scope:
const [showNotifyMenu, setShowNotifyMenu] = useState(false);
const prefs = useNotificationPrefsStore((s) => s.prefs);
const channelPref = prefs.find((p) => p.scopeType === 'channel' && p.scopeId === channel.id);

const bellIcon = (() => {
  if (channelPref?.mutedUntil && new Date(channelPref.mutedUntil) > new Date()) return '🔕';
  if (channelPref?.notifyLevel === 'all') return '🔔';
  return '🔔';
})();
const bellTitle = (() => {
  if (channelPref?.mutedUntil && new Date(channelPref.mutedUntil) > new Date()) {
    const until = new Date(channelPref.mutedUntil);
    if (until.getFullYear() > 9000) return 'Muted';
    return `Muted until ${until.toLocaleString()}`;
  }
  if (channelPref?.notifyLevel === 'all') return 'Notify on all messages';
  if (channelPref?.notifyLevel === 'nothing') return 'Notifications off';
  return 'Notifications: mentions only (default)';
})();

// ...in the header JSX, next to the channel name:
<button
  type="button"
  className="ml-2 text-lc-muted hover:text-lc-white relative"
  title={bellTitle}
  onClick={() => setShowNotifyMenu((v) => !v)}
  aria-label="Channel notification settings"
>
  {bellIcon}
</button>
{showNotifyMenu && (
  <div className="absolute z-50 mt-2">
    <NotifyMenu
      scope={{ type: 'channel', id: channel.id }}
      title={channel.name}
      onClose={() => setShowNotifyMenu(false)}
    />
  </div>
)}
```

> **Note:** Use Unicode bell glyphs (🔔 / 🔕) for v1 — they render uniformly without an icon library dep. If the project already imports a Lucide/Heroicons set, use the matching `Bell` and `BellOff` icons instead for visual consistency. Position the popover absolutely so it doesn't shift the header.

- [ ] **Step 3: Smoke test**

```bash
npm run dev
```

Navigate to a channel. Click the bell — popover appears. Pick "Mute for 8 hours" — bell flips to 🔕 and tooltip updates. Refresh the page — pref persists. Click again, "Reset to default" — back to 🔔.

- [ ] **Step 4: Commit**

```bash
git add src/components/chat/MessageArea.tsx
git commit -m "feat(notifications): bell icon in channel header opens NotifyMenu"
```

---

## Task B10: Right-click "Notification settings" on `ServerBar`

**Files:**
- Modify: `src/components/chat/ServerBar.tsx`

- [ ] **Step 1: Add a context-menu handler to the server icon**

Find the per-server icon render (likely a `<button>` or `<div>` with `key={server.id}`). Add right-click handling.

```tsx
import { useState } from 'react';
import { NotifyMenu } from '@/components/notifications/NotifyMenu';

// Inside the component:
const [contextMenu, setContextMenu] = useState<{ x: number; y: number; server: { id: string; name: string } } | null>(null);

// On the server icon element:
onContextMenu={(e) => {
  e.preventDefault();
  setContextMenu({ x: e.clientX, y: e.clientY, server: { id: server.id, name: server.name } });
}}

// Outside the loop, render the menu:
{contextMenu && (
  <div
    style={{ position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 60 }}
    onClick={(e) => e.stopPropagation()}
  >
    <NotifyMenu
      scope={{ type: 'server', id: contextMenu.server.id }}
      title={contextMenu.server.name}
      onClose={() => setContextMenu(null)}
    />
  </div>
)}

// Add a global click handler to dismiss:
useEffect(() => {
  if (!contextMenu) return;
  const close = () => setContextMenu(null);
  window.addEventListener('click', close);
  return () => window.removeEventListener('click', close);
}, [contextMenu]);
```

- [ ] **Step 2: Smoke test**

```bash
npm run dev
```

Right-click on a server icon — popover appears. Pick "Nothing" — bell at server level. Sub-channel mention now suppresses the OS notification (since channel inherits from server when no override). Reset.

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/ServerBar.tsx
git commit -m "feat(notifications): right-click server icon opens NotifyMenu"
```

---

## Task B11: Settings → Notifications section

**Files:**
- Create: `src/components/settings/NotificationsSection.tsx`
- Modify: `src/store/settings.ts` (add `'notifications'` to `SettingsSection`)
- Modify: `src/components/settings/SettingsModal.tsx` (register the section)

- [ ] **Step 1: Add the section to the type union**

In `src/store/settings.ts`:

```ts
export type SettingsSection = 'perfil' | 'apariencia' | 'wallet' | 'invitaciones' | 'actividad' | 'notifications';
```

- [ ] **Step 2: Create `NotificationsSection.tsx`**

```tsx
// src/components/settings/NotificationsSection.tsx
'use client';

import { useEffect, useState } from 'react';
import {
  readPermission,
  requestPermission,
  isSoftPromptEligible,
  isPermanentlyDismissed,
  setPermanentlyDismissed,
  type PermissionState,
} from '@/lib/notifications/permission';
import { useNotificationPrefsStore } from '@/store/notificationPrefs';

const SOUND_KEY = 'obelisk:notif-sound-enabled';

function readSound(): boolean {
  if (typeof localStorage === 'undefined') return true;
  return localStorage.getItem(SOUND_KEY) !== 'false';
}

export function NotificationsSection() {
  const [perm, setPerm] = useState<PermissionState>('unsupported');
  const [sound, setSound] = useState(true);
  const prefs = useNotificationPrefsStore((s) => s.prefs);
  const resetPref = useNotificationPrefsStore((s) => s.resetPref);

  useEffect(() => {
    setPerm(readPermission());
    setSound(readSound());
  }, []);

  const handleEnable = async () => {
    const next = await requestPermission();
    setPerm(next);
  };

  const handleSoundToggle = () => {
    const next = !sound;
    setSound(next);
    localStorage.setItem(SOUND_KEY, next ? 'true' : 'false');
  };

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-sm font-medium mb-2">Browser notifications</h3>
        {perm === 'unsupported' && <p className="text-lc-muted">Your browser doesn&apos;t support notifications.</p>}
        {perm === 'default' && (
          <button className="lc-pill-primary" onClick={handleEnable}>Enable browser notifications</button>
        )}
        {perm === 'granted' && <p className="text-lc-green">Enabled — you&apos;ll get OS notifications for mentions and DMs.</p>}
        {perm === 'denied' && (
          <p className="text-lc-muted">Blocked by your browser. Re-enable in your browser&apos;s site settings, then reload.</p>
        )}
      </section>

      <section>
        <h3 className="text-sm font-medium mb-2">Sound</h3>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={sound} onChange={handleSoundToggle} />
          <span>Play a sound for new mentions and DMs</span>
        </label>
      </section>

      <section>
        <h3 className="text-sm font-medium mb-2">Channel & server overrides</h3>
        {prefs.length === 0 && <p className="text-lc-muted">No overrides — every channel uses the default.</p>}
        {prefs.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-lc-muted">
                <th className="py-1">Scope</th><th>Level</th><th>Muted until</th><th />
              </tr>
            </thead>
            <tbody>
              {prefs.map((p) => (
                <tr key={p.id} className="border-t border-lc-border">
                  <td className="py-1">{p.scopeType}:{p.scopeId.slice(0, 12)}…</td>
                  <td>{p.notifyLevel ?? '—'}</td>
                  <td>{p.mutedUntil ? new Date(p.mutedUntil).toLocaleString() : '—'}</td>
                  <td>
                    <button
                      className="lc-pill-secondary text-xs"
                      onClick={() => resetPref({ type: p.scopeType as any, id: p.scopeId })}
                    >
                      Reset
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Register the section in `SettingsModal.tsx`**

Find the section navigator (the side-tab list inside the settings modal). Add a `'notifications'` entry following the same pattern as `'apariencia'`. In the section-render switch/object, render `<NotificationsSection />` for the new section.

```tsx
// At the top:
import { NotificationsSection } from './NotificationsSection';

// In the navigator list (alongside existing sections):
{ key: 'notifications', label: 'Notifications' },

// In the body switch:
case 'notifications':
  return <NotificationsSection />;
```

> **Note:** Match the exact pattern the existing sections use — copy the surrounding code style for `apariencia` and adapt.

- [ ] **Step 4: Smoke test**

```bash
npm run dev
```

Open Settings → Notifications. Click Enable — browser permission prompt fires. Grant. Status flips to "Enabled". Toggle Sound off, mention yourself from another tab — no beep. Toggle Sound on. Mute a channel via the bell, then go back to settings — overrides table shows the row. Click Reset — row disappears.

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/NotificationsSection.tsx src/store/settings.ts src/components/settings/SettingsModal.tsx
git commit -m "feat(notifications): settings panel with permission toggle, sound, and overrides"
```

---

## Task B12: Soft-prompt banner

**Files:**
- Create: `src/components/notifications/SoftPromptBanner.tsx`
- Modify: `src/app/chat/page.tsx` (mount the banner)

- [ ] **Step 1: Create the banner**

```tsx
// src/components/notifications/SoftPromptBanner.tsx
'use client';

import { useEffect, useState } from 'react';
import {
  readPermission,
  requestPermission,
  isSoftPromptEligible,
  isPermanentlyDismissed,
  setPermanentlyDismissed,
  type PermissionState,
} from '@/lib/notifications/permission';

export function SoftPromptBanner() {
  const [perm, setPerm] = useState<PermissionState>('unsupported');
  const [sessionDismissed, setSessionDismissed] = useState(false);
  const [now, setNow] = useState(Date.now());
  const sessionStartedAt = useState(() => Date.now())[0];

  useEffect(() => {
    setPerm(readPermission());
    const t = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(t);
  }, []);

  const eligible = isSoftPromptEligible({
    permission: perm,
    sessionStartedAt,
    now,
    sessionDismissed,
    permanentlyDismissed: isPermanentlyDismissed(),
  });

  if (!eligible) return null;

  const handleEnable = async () => {
    const next = await requestPermission();
    setPerm(next);
  };

  return (
    <div
      className="lc-card flex items-center gap-3 px-4 py-2 mx-4 my-2 border border-lc-border text-sm"
      role="status"
    >
      <span className="flex-1">
        Get notified about mentions and DMs even when Obelisk isn&apos;t focused.
      </span>
      <button className="lc-pill-primary text-xs" onClick={handleEnable}>Enable</button>
      <button className="lc-pill-secondary text-xs" onClick={() => setSessionDismissed(true)}>Not now</button>
      <button
        className="text-xs text-lc-muted hover:text-lc-white"
        onClick={() => { setPermanentlyDismissed(); setSessionDismissed(true); }}
      >
        Don&apos;t ask again
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Mount it in the chat page**

In `src/app/chat/page.tsx`, near the top of the rendered chat layout (above the message area), add:

```tsx
import { SoftPromptBanner } from '@/components/notifications/SoftPromptBanner';

// inside the JSX, top of the main column:
<SoftPromptBanner />
```

- [ ] **Step 3: Smoke test**

In a fresh incognito window:

```bash
npm run dev
```

Log in. Wait 60 seconds (or temporarily lower the threshold in `permission.ts` for testing — revert before commit). Banner appears. Click Enable — browser prompt fires. Grant. Banner disappears (permission flips to `granted`). Refresh — banner does not re-appear.

In another incognito window, log in, dismiss with "Don't ask again". Refresh — banner does not re-appear.

- [ ] **Step 4: Commit**

```bash
git add src/components/notifications/SoftPromptBanner.tsx src/app/chat/page.tsx
git commit -m "feat(notifications): soft-prompt banner with enable / not now / never options"
```

---

## Task B13: Re-prompt nudge inside `<NotifyMenu>`

**Files:**
- Modify: `src/components/notifications/NotifyMenu.tsx`

- [ ] **Step 1: Add permission-aware inline nudge**

In `NotifyMenu.tsx`, import the permission helpers and add a small inline section above the level fieldset:

```tsx
import { useEffect, useState } from 'react';
import { readPermission, requestPermission, type PermissionState } from '@/lib/notifications/permission';

// Inside the component, after existing hook calls:
const [perm, setPerm] = useState<PermissionState>('unsupported');
useEffect(() => { setPerm(readPermission()); }, []);

const handleEnable = async () => {
  const next = await requestPermission();
  setPerm(next);
};

// JSX — render above the level fieldset:
{perm === 'default' && (
  <div className="text-xs bg-lc-dark border border-lc-border p-2 rounded mb-3 flex items-center gap-2">
    <span className="flex-1">Browser notifications aren&apos;t enabled</span>
    <button className="lc-pill-primary text-xs" onClick={handleEnable}>Enable</button>
  </div>
)}
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run src/components/notifications/NotifyMenu.test.tsx
```

Expected: existing tests still pass — the new element only renders when `perm === 'default'`, and the test setup leaves Notification undefined so `readPermission` returns `'unsupported'` and the nudge does not render.

- [ ] **Step 3: Smoke test**

In an incognito window with Notification permission `default`:

```bash
npm run dev
```

Click the bell on any channel. Popover shows the inline "Browser notifications aren't enabled — Enable" row at the top. Click Enable — permission prompt fires.

- [ ] **Step 4: Commit**

```bash
git add src/components/notifications/NotifyMenu.tsx
git commit -m "feat(notifications): inline enable-permissions nudge inside NotifyMenu"
```

---

## Task B14: Final integration smoke + tag the milestone

- [ ] **Step 1: Run the entire test suite**

```bash
npm test
```

Expected: 100% pass.

- [ ] **Step 2: Production-style end-to-end smoke**

```bash
npm run build && npm start
```

(Skip if `npm start` requires extra setup — `npm run dev` covers most paths.)

Walk through:
1. Fresh login as User A in Browser 1
2. Login as User B in Browser 2 (different account / incognito)
3. Wait for soft-prompt banner on User A. Enable.
4. User B sends `@A hello` in #general. Browser 1 shows OS notification.
5. User A clicks the notification → focuses Obelisk, navigates to #general.
6. User A mutes #general for 8 hours via bell. User B sends another mention. No OS notification, but inbox + favicon counter still increment.
7. User A right-clicks server icon, picks "Nothing". User B mentions in another channel. No OS notification.
8. User A → Settings → Notifications → resets the server-level "Nothing". Mention works again.
9. Toggle sound off in settings. Mention → OS notification but no beep.
10. Toggle sound on. Mention → both.

Expected: every step works. Document any deviations as bugs to fix before merge.

- [ ] **Step 3: Run full test suite one more time**

```bash
npm test
```

- [ ] **Step 4: Tag and commit any final tweaks discovered during smoke**

```bash
git status
# fix any small issues, then:
git add -A
git commit -m "feat(notifications): final integration polish"
```

---

## Done

After Task B14 the feature is shippable:
- `server.ts` is gone, replaced by `server/{index,context,state,api-bridge,auth-middleware,handlers/*,bootstrap/*}.ts`
- 5 unit-tested pure helpers in `src/lib/server/`
- `src/lib/notifications/` with 4 tested modules
- `src/store/notificationPrefs.ts` with optimistic updates
- REST endpoint at `/api/notification-preferences`
- 3 UI surfaces: channel-header bell, server-icon right-click, settings panel
- Soft-prompt banner + in-menu nudge for permission opt-in
- All existing chat/voice/DM tests still green
