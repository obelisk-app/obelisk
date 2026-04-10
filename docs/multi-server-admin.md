# Multi-server Admin Panel

> Status: shipped — see commit on `master`

The admin panel (`/admin`) is **server-scoped**: every page, every API route, and every action operates on a single server identified in the URL or query string. This document explains the role hierarchy, the route shape, and the special "instance owner" concept that lets one global pubkey administer everything.

---

## Role hierarchy

Roles are evaluated **per server** (no global roles other than instance owner):

| Role          | Source                                                                 | Permissions                                                                  |
| ------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `instance`    | `INSTANCE_OWNER_PUBKEY` env var                                        | Everything on every server, plus ownership transfer (see below).             |
| `owner`       | `Server.ownerPubkey === caller pubkey` (authoritative)                 | All settings, role assignments, channels, bans, joinMode.                    |
| `admin`       | `Member.role === 'admin'` for that server                              | Everything except role changes and ownership.                                |
| `mod`         | `Member.role === 'mod'`                                                | Moderation actions (kick, ban, mute, warn). No settings/channels.            |
| `member`      | `Member.role === 'member'` (default)                                   | Cannot access `/admin`.                                                      |

**Owner role precedence** (in `getAuthMember`, `src/lib/auth-roles.ts`):

1. Caller pubkey === `INSTANCE_OWNER_PUBKEY` → `'owner'` + `instanceOwner: true`. No `Member` row required; one is synthesized in memory.
2. Caller pubkey === `Server.ownerPubkey` → `'owner'`.
3. Otherwise the stored `Member.role`.

This means moving someone in/out of `Member` rows never accidentally locks the instance owner out.

---

## Instance owner

Set in `.env`:

```
INSTANCE_OWNER_PUBKEY=d9590d95a7811e1cb312be66edd664d7e3e6ed57822ad9f213ed620fc6748be8
```

The helper `isInstanceOwner(pubkey)` (`src/lib/instance-owner.ts`) is the single source of truth. The instance owner:

- Sees every server in the `ServerPicker` dropdown, with role labelled `OWNER • INSTANCE` (vs. plain `OWNER` for per-server owners).
- Can transfer `Server.ownerPubkey` to any 64-char hex pubkey from the **Settings → Server Owner Pubkey** field. This is the only way the field appears.
- Bypasses all `requireRole` checks via the precedence above.

The instance owner does **not** need to be a `Member` of any server. The auth helper synthesizes a virtual member with `id: 'instance-owner'` so downstream code that expects a member object keeps working.

---

## URL structure

| URL                              | Purpose                                                                                 |
| -------------------------------- | --------------------------------------------------------------------------------------- |
| `/admin`                         | Index — fetches `/api/admin/servers` and `router.replace`s to the first visible server. |
| `/admin/[serverId]`              | The actual admin UI (members, channels, access, invitations, settings, bans).           |
| `/admin/[serverId]?tab=members`  | (future) Deep-link to a specific tab.                                                   |

The `[serverId]` route is a client component and unwraps `params` via `useEffect` (not `React.use()`) so it stays test-friendly.

---

## API surface

All admin routes live under `/api/admin/*` and accept `serverId` in one of two ways:

### Collection routes — `?serverId=` query param

These routes operate on a server as a whole and require the param explicitly. `requireServerIdFromQuery(req)` returns 400 if missing.

| Route                                              | Methods       | Min role |
| -------------------------------------------------- | ------------- | -------- |
| `/api/admin/servers`                               | GET           | any auth |
| `/api/admin/server`                                | GET, PATCH    | admin / owner (PATCH); ownerPubkey transfer requires instance owner |
| `/api/admin/server/join-mode`                      | PATCH         | owner    |
| `/api/admin/members`                               | GET           | admin    |
| `/api/admin/members/[pubkey]/role`                 | PATCH         | owner    |
| `/api/admin/members/[pubkey]/ban`                  | POST, DELETE  | admin    |
| `/api/admin/members/[pubkey]/kick`                 | POST          | admin    |
| `/api/admin/categories`                            | GET, POST     | admin    |
| `/api/admin/refresh-profiles`                      | POST          | admin    |

### Resource routes — derive from the resource

These routes look up the resource by id and use its `serverId` field to scope the auth check. No query param needed; passing one is ignored.

| Route                                  | Methods       | Min role |
| -------------------------------------- | ------------- | -------- |
| `/api/admin/channels/[id]`             | PATCH, DELETE | admin    |
| `/api/admin/categories/[id]`           | PATCH, DELETE | admin    |

### Reorder routes — derive from the batch

These take an array of items in the body, look them all up, verify they belong to the same server, and scope auth to that server. Cross-server batches are rejected with 400.

| Route                                  | Methods | Min role |
| -------------------------------------- | ------- | -------- |
| `/api/admin/channels/reorder`          | PATCH   | admin    |
| `/api/admin/categories/reorder`        | PATCH   | admin    |

### Channel creation — body param

`POST /api/channels` accepts `serverId` in the JSON body. Auth is scoped to that server. Used by the admin panel and may be used by chat-side flows in the future.

---

## `GET /api/admin/servers`

Returns the servers visible to the caller:

```jsonc
{
  "servers": [
    {
      "id": "srv1",
      "name": "La Crypta",
      "icon": "/lacrypta-logo.png",
      "banner": "/lacrypta-banner.png",
      "ownerPubkey": "d9590d95...",
      "role": "owner",            // caller's effective role on this server
      "viaInstanceOwner": true    // true when role comes from INSTANCE_OWNER_PUBKEY
    }
  ],
  "instanceOwner": true            // true if the caller is the instance owner
}
```

Visibility rules:

- **Instance owner** sees every server in the database.
- Otherwise the caller sees servers where they hold a `Member` row with role `owner`/`admin`/`mod`, **or** are listed as `Server.ownerPubkey` directly.

The `ServerPicker` dropdown in the admin header is fed by this endpoint.

---

## `/api/auth/me/role?serverId=...`

Returns the caller's effective role on a specific server, plus a flag indicating instance ownership:

```jsonc
{
  "role": "owner",
  "pubkey": "d9590d95...",
  "serverId": "srv1",
  "instanceOwner": true
}
```

The page calls this on every server switch. If `serverId` is omitted the route falls back to the first server in the database for backwards compatibility — the new admin page always passes it.

---

## Ownership transfer

**Who:** instance owner only.
**Where:** `/admin/[serverId]` → Settings tab → "Server Owner Pubkey" section (purple-bordered card).
**How it works:**

1. PATCH `/api/admin/server?serverId=...` with `{ ownerPubkey: '<64-char hex>' }`.
2. The route validates the pubkey shape (lowercase hex).
3. `Server.ownerPubkey` is updated.
4. The new owner is upserted into `Member` with `role: 'owner'` so they immediately appear in the panel.
5. A `ModerationAction` is logged with `metadata: { transfer: 'server_ownership', by: 'instance_owner' }`.

There is no "demote previous owner" step — they keep whatever `Member.role` they had. Cleaning that up is the operator's call.

---

## Tab layout

The admin panel has 5 tabs, all server-scoped:

| Tab | Purpose |
|---|---|
| **Members** | Active member list with role chips, kick/ban actions, "via invite" badges, and (instance-owner only) cross-server membership editing. |
| **Channels** | Channel + category CRUD with reorder. |
| **Access Control** | Single source of truth for who can join. Holds the join-mode selector, WoT settings, and invite links. See below. |
| **Settings** | Server profile (name, icon, banner) and ownership transfer (instance-owner only). Nothing access-related lives here anymore. |
| **Bans** | Banned pubkeys with reason. Hydrated from the `Ban` table even when no `Member` row remains (ban deletes the Member row). |

## Access Control tab

The Access Control tab consolidates what used to be three different surfaces
(`Access`, `Invitations`, and an "Access Control" section inside `Settings`).
It exposes one decision and three sets of controls:

### 1. Join Mode (the only access-control switch)

A 3-way selector at the top of the tab:

| Mode | Backing state | Behavior |
|---|---|---|
| **Open** | `joinMode='open'`, `wotEnabled=false` | Anyone can join via `POST /api/servers/:id/join`. |
| **Invite Only** | `joinMode='invite-only'`, `wotEnabled=false` | New users must redeem an invite via `POST /api/invitations/:code`. |
| **Web of Trust** | `wotEnabled=true` (joinMode is ignored) | Only npubs followed by the referente, on the override list, or holding a valid invite can join. |

Selecting WoT before a referente has been set produces an inline error
("Set a Referente pubkey below before enabling Web of Trust") — the toggle
is rejected by the UI without round-tripping the server.

### 2. Web of Trust subsection

Always rendered so admins can configure the referente, refresh the cache,
and manage overrides ahead of switching modes. Sections:

- **Referente input** — npub or hex pubkey. Saved via `PATCH /api/servers/:id/access`.
- **Refresh WoT** button — fires `POST /api/servers/:id/wot-refresh`. Shows
  `Synced: +N / -M / total T` after a successful refresh.
- **Auto-authorized list** — paginated, searchable list of `WotEntry` rows.
- **Manual overrides** — `WotOverride` rows with reason and remove action.
- **Invite credit policy** — thresholds (`minDaysActive`, `minMessages`,
  `invitesPerUser`, `inviteExpiryHours`) for regular members minting invites.

### 3. Active invitations

The existing `InviteManager` component, embedded under the Access Control
tab. Lets admins generate single-use or multi-use invite links, copy them
to the clipboard, and revoke. The invite badge in the Members tab
back-references which code each member came in with.

### Why one tab instead of three?

The old layout had three tabs all dealing with access: WoT lived in
`Access`, invite links in `Invitations`, and the legacy joinMode toggle in
`Settings`. They contradicted each other (WoT enabled while joinMode said
"open") and forced users to bounce between tabs to understand the access
posture. The unified tab makes the precedence explicit: pick a mode first,
then configure the controls relevant to that mode below.

## Cross-server membership editor (instance owner)

Each member row in the Members tab has a purple **Servers** button (visible
only to the instance owner). Clicking it opens a modal listing every server
in the instance with the user's current role on each, plus Add / Remove
buttons. Backed by:

```
GET    /api/admin/users/[pubkey]/memberships
POST   /api/admin/users/[pubkey]/memberships    body { serverId, role }
DELETE /api/admin/users/[pubkey]/memberships?serverId=...
```

All three endpoints are gated to the instance owner. `DELETE` refuses to
remove a server's owner — ownership must be transferred via Settings first.

## Server creation from /admin

Instance owner only. The ServerPicker dropdown gets a `+ New Server` entry
at the bottom that opens `CreateServerModal` (name + optional icon URL),
hits `POST /api/servers`, and on success navigates to `/admin/[newId]`.

The `POST /api/servers` route now allows the instance owner to create
unconditionally. Non-instance-owners must already own at least one server,
which preserves the original anti-spam guard.

## Migration notes

- `getDefaultServerId()` is now marked `@deprecated` and only used by:
  - `/api/auth/me/role` (as a fallback when `?serverId` is missing)
  - `/api/members/me`, `/api/members/me/sync-nostr` (single-server legacy endpoints — separate roadmap item)
  - All `/api/moderation/*` routes (moderation panel multi-server is a separate roadmap item)
- Existing tests for admin routes were updated to pass `?serverId=srv1` in the request URL.
- The old `/admin/page.tsx` test was deleted; the page is now a redirect index. The new tests live at `src/app/admin/[serverId]/page.test.tsx`.

---

## Files touched

```
src/lib/instance-owner.ts                   (new)
src/lib/auth-roles.ts                       (instance owner integration, query helpers)
src/app/api/admin/servers/route.ts          (new — visible servers list)
src/app/api/admin/**/*.ts                   (server-scoped via query / resource derivation)
src/app/api/auth/me/role/route.ts           (accepts ?serverId=)
src/app/api/channels/route.ts               (POST takes serverId in body)
src/app/admin/page.tsx                      (redirect index)
src/app/admin/[serverId]/page.tsx           (new — per-server admin panel)
src/components/admin/ServerPicker.tsx       (new — server dropdown)
src/components/admin/ChannelManager.tsx     (takes serverId prop)
src/lib/profile-sync.ts                     (refreshStaleProfiles accepts serverId)
```
