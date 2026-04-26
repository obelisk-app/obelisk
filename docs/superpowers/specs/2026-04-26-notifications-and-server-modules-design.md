# Notifications + `server.ts` modular refactor — design

**Date:** 2026-04-26
**Status:** Approved (pending user spec review)
**Author:** Claude (brainstormed with Leon)

## 1. Goals

Two tightly related changes ship together:

1. **WhatsApp-style native browser notifications** — when a user is mentioned in a channel or receives a DM, the browser shows an OS-level notification popup, plays the existing mention sound, and increments the favicon counter. Per-channel and per-server mute with duration choices. Non-intrusive: no popup when the user is actively watching the channel; no auto-prompt on first page load.
2. **Refactor monolithic `server.ts` (999 lines)** into a `server/` directory of focused handler modules with a `ServerContext` carrying shared state, plus pure helpers extracted to `src/lib/server/`. Notification fan-out gets a clean home in the new structure.

The notification feature work depends on the refactor's `lib/server/scope-chain.ts` helper and the new `notifications` handler module. Refactor lands first.

## 2. Decisions locked in

| # | Topic | Choice |
|---|---|---|
| Q2 | Trigger default | **Hybrid** — DMs always notify, channels only on mentions/replies/@everyone. Per-channel/per-server overrides. |
| Q3 | Mute UI scope | **Per-channel + per-server, both with duration choices** (15m / 1h / 8h / 24h / forever). |
| Q4 | Permission opt-in | **Soft prompt + persistent settings toggle + gentle re-prompt** when user opens mute UI without browser notifications enabled. |
| Q5 | Refactor depth | **Move + extract pure helpers + dependency-inject `io` and state via `ServerContext`.** |

## 3. Architecture overview

### 3.1 Notification stack (top → bottom)

`NotificationCenter` (new client module, `src/lib/notifications/`) owns the Web Notifications API surface: permission state, the `notify()` call, suppression rules, and the soft-prompt banner. It subscribes to existing socket events via the existing `useSocketLifecycle` hook — **no new socket plumbing**. It reads the user's `NotificationPreference` rows from a new client store, filters muted scopes, then decides whether to call `notify()`. Result of "notify": OS popup (`new Notification()`) + existing `playMentionSound()` + existing `setFaviconBadge()`.

### 3.2 Backend gates

The existing `Notification` socket event continues to fire unconditionally for mentions/DMs. Mute filtering happens **client-side** so muted channels still increment the favicon counter and in-app inbox (matches WhatsApp — muted chats still show in the list, just no popup/sound). Server gains REST endpoints for managing `NotificationPreference` rows. The `Notification` socket event payload is extended (additively) with `scopeChain` and `senderName` so the client can resolve preference inheritance without extra round-trips.

### 3.3 New directory layout (after refactor)

```
server/
├── index.ts              # bootstrap + http(s) server + io setup (~50 lines)
├── context.ts            # ServerContext type + factory
├── state.ts              # ServerState (in-memory Maps)
├── auth-middleware.ts    # socket handshake auth
├── api-bridge.ts         # typed exports replacing __io / __disconnectPubkey / __emitModEvent
├── handlers/
│   ├── presence.ts
│   ├── rooms.ts          # JoinServer, LeaveServer, JoinChannel, LeaveChannel
│   ├── messages.ts       # send/edit/delete + mention fan-out
│   ├── reactions.ts
│   ├── typing.ts
│   ├── read-state.ts
│   ├── voice.ts          # all voice signaling + mod actions
│   ├── notifications.ts  # NEW — notification fan-out helpers (not socket listeners)
│   └── disconnect.ts
└── bootstrap/
    ├── profile-sync.ts   # 6h NDK profile refresh
    ├── bot-poller.ts
    └── games.ts

src/lib/server/                # pure helpers, unit-testable
├── mention-fanout.ts
├── voice-capacity.ts
├── voice-payload.ts
├── room-keys.ts
├── presence-snapshot.ts
└── scope-chain.ts

src/lib/notifications/         # client browser-notification module
├── index.ts              # public API: notify(), requestPermission(), getState()
├── permission.ts         # browser permission state machine + soft-prompt logic
├── suppression.ts        # pure: shouldSuppress(payload, context) → boolean
└── prefs.ts              # pure: resolveScope(prefs, scopeChain) → resolved level

src/store/notificationPrefs.ts # Zustand store for NotificationPreference rows
```

## 4. Server-side notification fan-out

### 4.1 Trigger conditions

Unchanged from current behavior:

- **Channel mention** (`@npub` or `@everyone` from a mod+) → emit `Notification` to recipient pubkey's sockets.
- **Reply to message** → emit `Notification` of type `reply` to the original author.
- **DM** → emit `Notification` to recipient pubkey's sockets.

Non-mention channel messages still emit `NewMessage` (joined viewers) and `UnreadUpdate` (absent members) — unchanged.

### 4.2 Extended `Notification` payload (backwards-compatible)

```ts
interface NotificationPayload {
  recipientPubkey: string;
  type: 'mention' | 'reply' | 'everyone' | 'dm';
  serverId?: string;
  channelId?: string;
  postId?: string;
  messageId?: string;
  senderPubkey: string;
  preview?: string;
  createdAt: string;
  // NEW:
  scopeChain: Array<{ type: 'channel' | 'server' | 'dm'; id: string }>;
  senderName?: string;
}
```

`scopeChain` is most-specific → least: `[{channel, ch_x}, {server, s_y}]` for a channel mention, `[{dm, counterpartyPubkey}]` for a DM. Built by `lib/server/scope-chain.ts`.

`senderName` is resolved from `Member.displayName` (server-scoped) with fallback to `'npub1xxx…'` (truncated). Saves the client a profile lookup when composing the OS notification title.

### 4.3 New REST endpoints

```
GET    /api/notification-preferences           → all rows for the authed user
PUT    /api/notification-preferences           → upsert {scopeType, scopeId, notifyLevel?, mutedUntil?}
DELETE /api/notification-preferences           → delete by {scopeType, scopeId} (revert to inherit)
```

- Auth: existing `requireSession()` helper.
- Validation: `scopeType ∈ {server, channel, dm}` (category scope is reserved by the schema but unused in v1).
- "Forever" mute: client sends `mutedUntil = '9999-12-31T23:59:59.999Z'`. Single column handles both temporary and permanent mutes.
- "Reset to default": DELETE the row entirely (inheritance kicks in).

### 4.4 Out of scope (deferred)

- Server-side suppression of `Notification` emit when recipient has `notifyLevel='nothing'`. Saves wire bytes but requires server-side preference cache and inheritance resolution. Wire volume is small (one event per mention); revisit if it becomes a problem.

## 5. Client-side `NotificationCenter`

### 5.1 Module surface

```ts
// src/lib/notifications/index.ts
export const NotificationCenter = {
  notify(payload: NotificationPayload): void;     // gates via shouldSuppress
  requestPermission(): Promise<NotificationPermission>;
  getState(): { permission: NotificationPermission; promptEligible: boolean };
};
```

### 5.2 Permission state machine (`permission.ts`)

States: `'unknown' | 'default' | 'granted' | 'denied'`.

- On chat page mount, read `Notification.permission` once, cache in module state.
- Soft-prompt eligibility (Q4-C):
  1. `permission === 'default'`
  2. User logged in ≥ 60s on this session
  3. Hasn't dismissed banner this session
  4. Hasn't permanently dismissed (`localStorage['obelisk:notif-prompt-dismissed'] !== 'true'`)
- Re-prompt nudge: when user opens `<NotifyMenu>` and `permission === 'default'`, show inline `[Enable]` link in the menu header. No auto-popup.
- **Never call `Notification.requestPermission()` without an explicit user click.** Browsers penalize sites that auto-prompt; once denied it's hard to recover.

### 5.3 Suppression rules (`suppression.ts`, pure)

```ts
function shouldSuppress(
  payload: NotificationPayload,
  ctx: SuppressionContext,
): boolean
```

Returns `true` if any of:

1. **Actively reading.** `document.visibilityState === 'visible'` AND `window` has focus AND `payload.channelId === ctx.activeChannelId` AND `(no postId OR payload.postId === ctx.activePostId)` AND `ctx.scrolledToBottom === true`.
2. **Muted/silenced.** `resolveScope(prefs, payload.scopeChain)` yields `{muted: true}` or `notifyLevel === 'nothing'`.
3. **Own echo (defensive).** `payload.senderPubkey === ctx.viewerPubkey`.

### 5.4 Scope resolution (`prefs.ts`, pure)

```ts
function resolveScope(
  prefs: NotificationPreference[],
  scopeChain: ScopeRef[],
): { notifyLevel: 'all'|'mentions'|'nothing'; mutedUntil: Date|null }
```

Walks `scopeChain` most-specific → least. First row found with `mutedUntil > now` or non-null `notifyLevel` wins. If no row matches any scope, returns the default (`{notifyLevel: 'mentions', mutedUntil: null}`). DM scope chains are 1-element.

Mute and notify-level resolve **independently** — a channel can have `notifyLevel='all'` and `mutedUntil` set simultaneously; mute wins for the popup, level still affects future un-mute behavior.

### 5.5 `notify()` composition

`NotificationOptions` built per type:

| Field | Mention/reply/everyone in channel | Forum-post reply | DM |
|---|---|---|---|
| `title` | `#${channelName}` | `${senderName} in #${channelName}` | `${senderName}` |
| `body` | `payload.preview` (≤140 chars) | same | same |
| `tag` | `payload.channelId` | `payload.postId` | `payload.senderPubkey` |
| `icon` | `/favicon.ico` | same | same |
| `silent` | `true` (we play our own sound) | same | same |
| `data` | `{ channelId, serverId, postId?, messageId }` | same | `{ counterpartyPubkey }` |

`tag` re-use means a second notification from the same channel **replaces** the first instead of stacking — WhatsApp behavior.

`onclick`: `window.focus()` + `router.push()` to the right destination, then `notification.close()`.

**Browser quirk:** older Safari ignores `silent: true`. Feature-detect; if unsupported, skip `playMentionSound()` to avoid double-beep.

### 5.6 Wiring into `useSocketLifecycle`

No new socket subscriber. The existing `socket.on(ServerToClient.Notification, ...)` block (currently at line 291) gains one line per branch:

```ts
NotificationCenter.notify(data);
```

`NotificationCenter.notify()` internally runs `shouldSuppress()` and bails before calling `new Notification()` / `playMentionSound()`. The existing inbox push and mention-dot logic still runs unconditionally — suppression only gates the OS popup + sound.

**Behavior change called out:** today, `playMentionSound()` is invoked unconditionally in the socket handler, so muted channels still beep. Post-change, the sound moves inside `notify()` and respects suppression. This is a fix, not a regression.

## 6. Mute / notify-level UI

### 6.1 Channel header bell icon (`MessageArea.tsx` header)

A bell icon next to the channel name. States:

| Icon | Meaning | Tooltip |
|---|---|---|
| 🔔 | Default (inheriting) | "Notifications: mentions only (default)" |
| 🔕 | Muted (currently) | "Muted until 8:32 PM" or "Muted" if forever |
| 🔔+ | `notifyLevel='all'` | "Notify on all messages" |

Click → `<NotifyMenu>` popover (new component, `src/components/notifications/NotifyMenu.tsx`):

```
┌─────────────────────────────────┐
│ Notifications for #general      │
│ ─────────────────────────────── │
│ ○ Default (mentions only)       │
│ ○ All messages                  │
│ ○ Nothing                       │
│ ─────────────────────────────── │
│ Mute for                        │
│ ○ 15 minutes                    │
│ ○ 1 hour                        │
│ ○ 8 hours                       │
│ ○ 24 hours                      │
│ ○ Until I turn it back on       │
│ ─────────────────────────────── │
│ [Reset to default]              │
└─────────────────────────────────┘
```

Notify-level group and mute group are independent radio sections. Picking either writes to the same `NotificationPreference` row via `useNotificationPrefsStore.setPref()`. **[Reset to default]** triggers DELETE.

### 6.2 Server context menu (`ServerBar.tsx`)

Right-click on a server icon → menu with **"Notification settings"** at the top. Opens the same `<NotifyMenu>` scoped to the server (`scopeType='server'`). Header reads *"Notifications for ${serverName}"*.

Server-level preference inherits down via the resolver: a `notifyLevel='nothing'` on the server suppresses all channels in it that don't have their own override.

### 6.3 Settings → Notifications panel

New section in the settings modal (extends `useSettingsStore` section enum). Three blocks:

1. **Browser notifications.** Permission state display + Enable/Disable toggle that calls `NotificationCenter.requestPermission()`. If `denied`, shows *"Blocked by browser. Re-enable in your browser's site settings."*
2. **Sound.** Toggle for `playMentionSound()`. Boolean persisted in `localStorage['obelisk:notif-sound-enabled']` (defaults to `true`). Read by `NotificationCenter.notify()` before calling `playMentionSound()`. No new Zustand store needed — `settings.ts` is UI-state only and we don't want to plumb persistence into it for one boolean.
3. **Overrides.** Table listing every `NotificationPreference` row for this user — `{scope name, level, muted until, [Reset]}`. Lets users find that channel they muted weeks ago.

### 6.4 State management

New Zustand store `src/store/notificationPrefs.ts`:

```ts
interface NotificationPrefsState {
  prefs: NotificationPreference[];
  hydrated: boolean;
  hydrate: () => Promise<void>;                                    // GET on login
  setPref: (scope: ScopeRef, partial: PrefPatch) => Promise<void>; // optimistic + PUT
  resetPref: (scope: ScopeRef) => Promise<void>;                   // optimistic + DELETE
  resolve: (scopeChain: ScopeRef[]) => ResolvedPref;               // wraps lib/notifications/prefs.ts
}
```

Hydrated once on login completion (alongside the existing `setBulkUnreads` call in the auth flow). Optimistic updates roll back on API error with a toast.

### 6.5 Mute expiry

When `mutedUntil` passes, the resolver naturally returns "not muted" (because `Date.now() > mutedUntil`). Bell icon refreshes on next render. **No tick timer.** Acceptable for v1; per-second tick is overkill.

## 7. `server.ts` refactor

### 7.1 `ServerContext` shape

```ts
// server/context.ts
import type { Server as IOServer, Socket } from 'socket.io';
import type { PrismaClient } from '@/generated/prisma';

export interface ServerState {
  pubkeySockets: Map<string, Set<string>>;       // pubkey → socketIds
  voiceSockets: Map<string, string>;             // socketId → channelId
  voiceSocketPubkey: Map<string, string>;        // socketId → pubkey
  cameraSharers: Map<string, Set<string>>;       // channelId → pubkeys
  screenSharers: Map<string, Set<string>>;       // channelId → pubkeys
}

export interface ServerContext {
  io: IOServer;
  prisma: PrismaClient;
  state: ServerState;
  limits: { maxCameras: number; maxScreens: number };
}

export function createServerContext(io: IOServer, prisma: PrismaClient): ServerContext;
```

### 7.2 Handler interface

Every file in `server/handlers/` exports the same shape:

```ts
export function register(ctx: ServerContext, socket: Socket): void {
  socket.on('SendMessage', async (payload) => { /* ... */ });
  // ...
}
```

`server/index.ts` wires them on `connection`:

```ts
io.use(authMiddleware(ctx));
io.on('connection', (socket) => {
  presence.register(ctx, socket);
  rooms.register(ctx, socket);
  messages.register(ctx, socket);
  reactions.register(ctx, socket);
  typing.register(ctx, socket);
  readState.register(ctx, socket);
  voice.register(ctx, socket);
  notifications.register(ctx, socket);  // exports helpers used by other handlers
  disconnect.register(ctx, socket);     // last — runs cleanup
});
```

### 7.3 `notifications.ts` handler

Mostly fan-out helpers, not socket listeners:

```ts
export function emitMentionNotification(ctx, recipient, msg, scope): void;
export function emitDMNotification(ctx, recipient, dm): void;
```

Centralizes the `Notification` event payload construction (especially `scopeChain` + `senderName`) so all emission paths stay consistent.

### 7.4 `api-bridge.ts`

Replaces module-level globals (`globalThis.__io`, `__disconnectPubkey`, `__emitModEvent`) with typed exports:

```ts
let activeContext: ServerContext | null = null;

export function bindContext(ctx: ServerContext): void;
export function emitModEvent(serverId: string, event: string, payload: unknown): void;
export function disconnectPubkey(pubkey: string, reason: string): void;
export function getIO(): IOServer;  // for API routes that need it
```

API routes import from `@/server/api-bridge` instead of reaching for `globalThis`.

### 7.5 Pure helpers extracted to `src/lib/server/`

Unit-testable without spinning up Socket.io:

| File | Purpose |
|---|---|
| `mention-fanout.ts` | Re-exports + filtering rules for who-gets-notified |
| `voice-capacity.ts` | `canAddCamera(state, channelId, limits)` / `canAddScreen(...)` |
| `voice-payload.ts` | `validateVoiceSignal(payload)` SDP/ICE shape check |
| `room-keys.ts` | `roomFor.channel(id)`, `roomFor.server(id)`, `roomFor.dm(pubkey)` |
| `presence-snapshot.ts` | `buildPresenceSnapshot(pubkeySockets)` → online list |
| `scope-chain.ts` | `buildScopeChain({channel, server})` for notification payload |

### 7.6 Migration plan — six steps, each independently green-able

1. **Scaffold `server/` + `ServerContext`.** Create `context.ts`, `state.ts`, `api-bridge.ts`. New `server/index.ts` is a thin shim that delegates to `server.ts`. Behavior unchanged. `npm test` + manual smoke.
2. **Extract pure helpers to `src/lib/server/`.** Move (don't rewrite) helper logic. Update imports. Add unit tests for the extracted functions. Behavior unchanged.
3. **Move auth-middleware + presence handler.** Smallest concerns; validates the `register(ctx, socket)` pattern.
4. **Move rooms, typing, read-state, reactions.** Mid-complexity; no shared-state surprises.
5. **Move messages + notifications fan-out.** Most cross-deps; do after the simpler ones. Updates `Notification` event payload to include `scopeChain` + `senderName`.
6. **Move voice + disconnect + bootstrap.** Voice is the largest single concern but self-contained. Disconnect last because it touches every state Map.

After step 6, `server.ts` is deleted. `package.json` `dev`/`build` scripts point at `server/index.ts`. Notification feature work (Sections 3.1, 5, 6) lands **on top of** the refactor.

**No behavior changes from the refactor itself.** Existing chat/voice/DM integration tests are the regression net. Per CLAUDE.md, no step is "done" until `npm run test` passes.

## 8. Testing

### 8.1 Notification feature

| Module | Test type | Coverage |
|---|---|---|
| `lib/notifications/suppression.ts` | Unit | active-channel suppression, focus state, postId match, own-echo, mute resolution |
| `lib/notifications/prefs.ts` | Unit | `resolveScope()` chain walking, mute expiry, level inheritance |
| `lib/notifications/permission.ts` | Unit | state machine transitions; mock `Notification.permission`; soft-prompt eligibility |
| `lib/notifications/index.ts` | Unit | `notify()` builds correct title/body/tag/icon for each payload type; respects suppression |
| `store/notificationPrefs.ts` | Unit | hydrate, optimistic upsert + rollback, optimistic delete |
| `api/notification-preferences/route.ts` | Integration | GET scoped to authed user, PUT upsert, DELETE removes, auth required |
| `components/notifications/NotifyMenu.tsx` | RTL | renders current state, level + mute write through store, "reset" deletes |
| `useSocketLifecycle.ts` mention path | Integration (extend existing) | calls `NotificationCenter.notify()`; suppression skips when actively watching |

### 8.2 Refactor

| Module | Test type |
|---|---|
| `lib/server/voice-capacity.ts` | Unit — at limit, after leave, empty channel |
| `lib/server/voice-payload.ts` | Unit — accepts SDP/ICE, rejects malformed |
| `lib/server/scope-chain.ts` | Unit — channel-in-server (2-element), DM (1-element) |
| `lib/server/presence-snapshot.ts` | Unit — multi-socket dedup |
| `lib/server/room-keys.ts` | Unit — formatting + collision avoidance |
| Existing chat/voice/DM integration tests | **Must stay green at every step.** |

No new tests for `server/index.ts` or `server/handlers/*` — orchestration covered by existing integration tests.

## 9. Risks & mitigations

1. **Browser permission is sticky after denial.** Soft prompt before the real prompt; settings shows "blocked, unblock here" copy; never auto-trigger `requestPermission()`.
2. **Refactor regression risk on shared state.** Extract `state.ts` first; keep same Map references; no semantic changes; integration tests catch fan-out bugs.
3. **`scopeChain` payload growth.** ~80 bytes/event added. Negligible (mentions are rare).
4. **Mute timer drift across tabs.** None — each tab evaluates `Date.now() > mutedUntil` against its local clock independently.
5. **`silent: true` not supported in older Safari.** Feature-detect; if unsupported, skip `playMentionSound()` to avoid double-beep.

## 10. Out of scope (deferred)

- Custom mute duration picker beyond presets
- Per-user mute / block list
- Service worker push (background notifications when no tab open) — needs VAPID + server push infra
- iOS Safari < 16.4 PWA notifications
- Server-side suppression of `Notification` emit for `notifyLevel='nothing'` recipients
- Category-scope mute (schema reserves `scopeType='category'` but no UI in v1)

## 11. File-by-file change summary

**New files:**

```
server/index.ts
server/context.ts
server/state.ts
server/api-bridge.ts
server/auth-middleware.ts
server/handlers/{presence,rooms,messages,reactions,typing,read-state,voice,notifications,disconnect}.ts
server/bootstrap/{profile-sync,bot-poller,games}.ts
src/lib/server/{mention-fanout,voice-capacity,voice-payload,room-keys,presence-snapshot,scope-chain}.ts
src/lib/notifications/{index,permission,suppression,prefs}.ts
src/store/notificationPrefs.ts
src/app/api/notification-preferences/route.ts
src/components/notifications/NotifyMenu.tsx
src/components/settings/NotificationsSection.tsx
+ co-located *.test.ts for each new module
```

**Modified files:**

```
server.ts                                  → DELETED (after step 6)
package.json                               → dev/build script points at server/index.ts
src/hooks/chat/useSocketLifecycle.ts       → call NotificationCenter.notify() in Notification handler
src/components/chat/MessageArea.tsx        → bell icon in header
src/components/chat/ServerBar.tsx          → right-click → notification settings
src/store/settings.ts                      → add 'notifications' section
src/components/settings/SettingsModal.tsx  → register the new "notifications" section
src/components/settings/NotificationsSection.tsx (NEW) → the panel itself, alongside AppearanceSection.tsx
+ all API routes that import globalThis.__io → import from @/server/api-bridge
```

**No DB schema changes.** `NotificationPreference` and `InboxItem` tables already exist (migration `20260419000000_add_notification_prefs_and_inbox`).
