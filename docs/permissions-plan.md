# Permissions Plan — Write-Locked Channels and Per-Post Locks

## Goal

Two related permission features so that "important" channels and forum posts can be made read-only for regular members:

1. **Channel write-permission** — any channel can be set to `everyone` (default), `mod` (only mods+admins+owners can write or edit), or `admin` (only admins+owners can write or edit). Configurable from `/admin → ChannelManager`.
2. **Per-post lock** — a forum post can be individually locked by its author (or by a mod). When locked, replies are rejected for everyone except mods+admins. The post author can unlock at any time. Channel-level write-permission and per-post lock are independent and stack — both must allow the write for it to go through.

Mods/admins always bypass per-post locks for moderation purposes, but channel `writePermission` of `admin` does block mods from writing in that channel.

## Schema changes — `prisma/schema.prisma`

Add to `Channel`:
```prisma
writePermission String?  // null | "everyone" | "mod" | "admin"; null = everyone
```

Add to `Message`:
```prisma
locked Boolean @default(false)
```

`Message.locked` is only meaningful on rows that are forum posts (`title IS NOT NULL` and `replyToId IS NULL`). Boolean rather than enum because the requirement is binary "freeze this post". If granular gating is ever needed, channel `writePermission` already covers it.

## Migration

New migration directory `prisma/migrations/<timestamp>_add_channel_write_permission_and_post_lock/migration.sql`:

```sql
ALTER TABLE "Channel" ADD COLUMN "writePermission" TEXT;
ALTER TABLE "Message" ADD COLUMN "locked" BOOLEAN NOT NULL DEFAULT false;
```

Pattern follows `prisma/migrations/20260410120000_wot_and_invite_credits/migration.sql`.

## Permission helpers — `src/lib/auth-roles.ts`

Three new functions, all reusing the existing `hasRole(memberRole, minimumRole)` at line 15:

```ts
export function canWriteInChannel(
  memberRole: Role,
  channel: { writePermission: string | null }
): boolean {
  if (!channel.writePermission || channel.writePermission === "everyone") return true;
  if (channel.writePermission === "mod") return hasRole(memberRole, "mod");
  if (channel.writePermission === "admin") return hasRole(memberRole, "admin");
  return true;
}

// Forum post lock — replies blocked when locked, except mods+admins (moderation bypass)
export function canReplyToPost(
  memberRole: Role,
  post: { locked: boolean }
): boolean {
  if (!post.locked) return true;
  return hasRole(memberRole, "mod");
}

// Who can toggle a post's lock — author or any mod+
export function canTogglePostLock(
  memberRole: Role,
  memberPubkey: string,
  post: { authorPubkey: string }
): boolean {
  if (memberPubkey === post.authorPubkey) return true;
  return hasRole(memberRole, "mod");
}
```

Unit tests for all three in `src/lib/auth-roles.test.ts` (or new `auth-roles.permissions.test.ts` if the existing file is large).

## Backend enforcement

After existing ban/mute checks in each handler, fetch the channel (most handlers already do) and add the appropriate permission checks. Return 403 with a specific error code on fail (e.g. `{ error: "channel_write_locked" }` / `{ error: "post_locked" }`) so the frontend can show the right message.

### Channel write-permission touch points

| # | File | Where | Check |
|---|------|-------|-------|
| 1 | `src/app/api/channels/[channelId]/messages/route.ts:59` | POST after ban/mute (lines 89–102) | `canWriteInChannel` |
| 2 | `src/app/api/channels/[channelId]/messages/route.ts:155` | PATCH after author check (line 188) | `canWriteInChannel` (locking the channel also freezes editing of pre-existing messages) |
| 3 | `src/app/api/channels/[channelId]/posts/route.ts:64` | POST forum post | `canWriteInChannel` |
| 4 | `src/app/api/channels/[channelId]/posts/[postId]/route.ts:57` | POST reply | `canWriteInChannel` |
| 5 | `server.ts` | Any socket-only write path (audit during impl — REST appears to be the only write path) | mirror REST checks |

### Per-post lock touch points

| # | File | Where | Check |
|---|------|-------|-------|
| 6 | `src/app/api/channels/[channelId]/posts/[postId]/route.ts:57` | POST reply, after #4 | `canReplyToPost` (parent post already fetched for `replyToId`) |
| 7 | `src/app/api/channels/[channelId]/posts/[postId]/route.ts` | PATCH/DELETE on a reply (if separate handlers exist; otherwise the channel-message PATCH/DELETE in `messages/route.ts` covers replies via the same `Message` row) | `canReplyToPost` against the parent post |
| 8 | **NEW** `src/app/api/channels/[channelId]/posts/[postId]/lock/route.ts` | PATCH `{ locked: boolean }` | `canTogglePostLock` |

### Endpoint #8 details — lock toggle

- **Method**: `PATCH`
- **Body**: `{ locked: boolean }`
- **Auth**: load post (`Message` where `id=postId`, `title NOT NULL`, `replyToId IS NULL`), call `canTogglePostLock(member.role, member.pubkey, post)`. 403 on fail.
- **Effect**: `prisma.message.update({ where: { id: postId }, data: { locked: body.locked } })`
- **Real-time**: emit a new `post-lock-changed` socket event to **both** `channel:${channelId}` and `post:${postId}` rooms with `{ postId, locked }`. The chat store handler updates the cached post and re-renders the lock icon and the input disabled state in real time.

### Moderation bypass

`src/app/api/moderation/messages/[id]/route.ts:14` (mod-only delete) is **not** gated by `writePermission` or `locked`. Mods can always remove content for moderation reasons.

## Admin UI — `src/components/admin/ChannelManager.tsx`

Add a dropdown in the channel edit form, after the existing type dropdown around line 189:

```tsx
<label className="block">
  <span className="text-sm text-lc-muted">Write permission</span>
  <select
    value={editForm.writePermission ?? "everyone"}
    onChange={(e) => setEditForm({ ...editForm, writePermission: e.target.value })}
    className="lc-input mt-1 w-full"
  >
    <option value="everyone">Everyone</option>
    <option value="mod">Mods &amp; Admins only</option>
    <option value="admin">Admins only</option>
  </select>
</label>
```

PATCH body sent to `/api/admin/channels/[id]` includes `writePermission: "everyone" | "mod" | "admin"`.

## Admin API — `src/app/api/admin/channels/[id]/route.ts`

Already uses a whitelist pattern (lines 23–43) under `requireRole(req, serverId, "admin")` (line 20). Add to the whitelist:

```ts
if (body.writePermission !== undefined) {
  const allowed = ["everyone", "mod", "admin"];
  if (body.writePermission !== null && !allowed.includes(body.writePermission)) {
    return NextResponse.json({ error: "invalid writePermission" }, { status: 400 });
  }
  // Normalize "everyone" to null in storage so the default state is a single value
  data.writePermission = body.writePermission === "everyone" ? null : body.writePermission;
}
```

## Frontend UX

### `MessageInput.tsx`

Disabled state checks both layers in order:

1. If active context is a channel and `!canWriteInChannel(currentMemberRole, channel)` → disabled, placeholder `"Only mods/admins can write in this channel"` (or `"Only admins can write in this channel"` for admin-only).
2. Else if active context is a forum post and `!canReplyToPost(currentMemberRole, post)` → disabled, placeholder `"This post is locked"`.
3. Else enabled.

Pull `channel` and `post` from the chat store (already cached for the active context).

### `ChannelSidebar.tsx`

Small lock icon (lucide-react `Lock`, 12px, `text-lc-muted`) next to channels where the current user can't write. Computed once per channel from `canWriteInChannel`.

### `ForumView.tsx`

- **Post list view**: lock icon on cards where `post.locked` is true. Use the same `Lock` icon from lucide-react for consistency.
- **Post detail view**: small "Lock post" / "Unlock post" pill button visible only to users where `canTogglePostLock(...)` returns true. Calls `PATCH /api/channels/[channelId]/posts/[postId]/lock`. Optimistic update + revert on error.
- A locked post displays a subtle banner above the reply input: `"This post is locked. Only moderators can reply."` (or `"You locked this post. Click Unlock to reopen replies."` for the author).

### Aesthetics

All new UI elements follow the La Crypta design system already in use:

- **Lock icon**: lucide-react `Lock`, 12–14px, `text-lc-muted` for read-only indicators, `text-lc-green` when the current user is the one who locked it.
- **Lock/Unlock button**: `lc-pill-secondary` for "Lock post", `lc-pill-primary` for "Unlock post" (so the active state is the lime accent).
- **Disabled input**: existing `lc-input` styling with `opacity-50 cursor-not-allowed` and the explanatory placeholder.
- **Banner**: `lc-card` with `border-l-2 border-lc-green` accent, `text-sm text-lc-muted`, lock icon on the left.
- **Admin dropdown**: existing `lc-input` select styling already used in `ChannelManager`.

No new CSS classes — everything reuses existing tokens.

## Tests

Unit:
- `auth-roles.test.ts`: `canWriteInChannel` (everyone/mod/admin against owner/admin/mod/member), `canReplyToPost` (locked vs unlocked, mod bypass), `canTogglePostLock` (author, mod, random member).

API:
- `messages/route.test.ts`: POST and PATCH return 403 when channel is locked and member lacks role; succeed for admin/mod as appropriate.
- `posts/route.test.ts`: POST forum post returns 403 when channel locked.
- `posts/[postId]/route.test.ts`: POST reply returns 403 when channel locked OR parent post locked; mod bypasses post lock.
- `posts/[postId]/lock/route.test.ts` (new): PATCH lock toggle — author can lock/unlock, mod can lock/unlock, random member gets 403.

UI:
- `ChannelManager.test.tsx`: write-permission dropdown renders with current value, change fires PATCH with the new value.
- `ForumView.test.tsx`: lock button appears only for author and mods; clicking it calls the lock endpoint; locked post shows the lock icon and banner; non-mods see disabled input.

`/api/admin/channels/[id]/route.test.ts`: PATCH with `writePermission` persists and normalizes `"everyone"` to `null`.

## Rollout / migration safety

- Migration is additive only — both new columns are nullable / defaulted, so existing rows continue to work without backfill.
- Existing channels default to `writePermission = null` = `"everyone"`, so no behavior change for any current channel until an admin opts in.
- Existing forum posts default to `locked = false`, so no behavior change.
- Rollback: dropping the columns is safe since no existing code reads them.

## Files touched (final list)

**Schema/migration:**
- `prisma/schema.prisma`
- `prisma/migrations/<new>/migration.sql`

**Backend:**
- `src/lib/auth-roles.ts`
- `src/lib/auth-roles.test.ts` (or new `auth-roles.permissions.test.ts`)
- `src/app/api/channels/[channelId]/messages/route.ts`
- `src/app/api/channels/[channelId]/messages/route.test.ts`
- `src/app/api/channels/[channelId]/posts/route.ts`
- `src/app/api/channels/[channelId]/posts/route.test.ts`
- `src/app/api/channels/[channelId]/posts/[postId]/route.ts`
- `src/app/api/channels/[channelId]/posts/[postId]/route.test.ts`
- `src/app/api/channels/[channelId]/posts/[postId]/lock/route.ts` **(new)**
- `src/app/api/channels/[channelId]/posts/[postId]/lock/route.test.ts` **(new)**
- `src/app/api/admin/channels/[id]/route.ts`
- `src/app/api/admin/channels/[id]/route.test.ts`
- `server.ts` (post-lock-changed broadcast, possibly join-post / leave-post handlers if not already added by Part A)

**Frontend:**
- `src/components/admin/ChannelManager.tsx`
- `src/components/admin/ChannelManager.test.tsx`
- `src/components/chat/ChannelSidebar.tsx`
- `src/components/chat/MessageInput.tsx`
- `src/components/chat/ForumView.tsx`
- `src/components/chat/ForumView.test.tsx`
- `src/store/chat.ts` (cache `writePermission` on channels and `locked` on posts; handle `post-lock-changed` event)

## Verification

**Channel write-lock:**
1. Log in as admin, create a channel, set Write Permission to "Admins only" via `/admin → ChannelManager`.
2. As a regular member: input is disabled with the placeholder; `curl -X POST /api/channels/<id>/messages` returns 403 `channel_write_locked`.
3. As an admin: can post and edit.
4. Try editing a pre-existing message after locking → also blocked.
5. Forum post and reply endpoints in the same channel also reject non-admins.
6. Sidebar shows the lock icon next to the channel for non-privileged users.

**Per-post lock:**
7. As user A, create a forum post in an open channel. Click "Lock post". Lock button appears only for A and for mods.
8. As user B (regular member): post detail input is disabled with "This post is locked"; `curl -X POST` to the reply endpoint returns 403 `post_locked`.
9. As a mod: can still reply (moderation bypass).
10. User A clicks "Unlock post" — input re-enables for everyone.
11. Lock icon shows on the post card in the forum list view.
12. Open the post in two browser tabs; locking in one tab updates the other in real time via `post-lock-changed`.

**Final gate:** `npm run test` green.
