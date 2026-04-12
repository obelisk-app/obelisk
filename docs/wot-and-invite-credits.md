# Web of Trust + Activity-Based Invite Credits

> Obelisk's core anti-spam features. They turn the server's social graph into
> a self-serving access-control system: trusted users get in automatically,
> active members can vouch for new ones, spammers get nothing.

## Overview

Discord-like servers face a constant tension between **openness** (anyone can
join) and **safety** (spammers ruin the experience). Most platforms solve this
with email/phone verification, captchas, or admin-only invites.

Obelisk solves it with **Nostr identity + the social graph**:

1. **Web of Trust (WoT) auto-registration** — each server designates a trusted
   "referente" Nostr account. Anyone the referente already follows on Nostr
   (their kind 3 contact list) is auto-admitted to the server, no invite
   required. This turns the referente's existing social graph into the
   server's pre-approved member pool.
2. **Tenure-based invite credits** — members who have been in the server for
   a minimum number of days (default 7) earn a limited pool of single-use,
   auto-expiring invite links they can share with friends outside the WoT.
   This grows the community organically through vouching, not through admin
   bottlenecks.

Together they let a server bootstrap from a trusted root and grow through
legitimate human relationships, while making sybil/spam attacks expensive:
the attacker would need to either (a) be followed by the referente, (b) be
manually whitelisted, or (c) get an active, vouching member to burn one of
their precious credits.

---

## WoT auto-registration

### Concept

Every Nostr account publishes a public **kind 3** event listing the pubkeys
it follows. Obelisk treats one chosen account — the **referente** — as
authoritative for a given server. The referente's follow list becomes the
server's allow-list.

Example: La Crypta runs an Obelisk server. They set their official La Crypta
npub as the referente. Anyone La Crypta follows on Nostr can immediately
log in to the La Crypta Obelisk server and start chatting.

### Behavior matrix (when `wotEnabled = true`)

| User state                                  | Result      |
|---------------------------------------------|-------------|
| Already a member of the server              | ✅ Allowed (grandfathered) |
| In `WotEntry` (referente follows them)      | ✅ Auto-joined |
| In `WotOverride` (admin whitelisted)        | ✅ Auto-joined |
| Holds a valid `Invitation` link             | ✅ Allowed via redemption |
| None of the above                           | ❌ 403 — must redeem an invite |
| Banned                                      | ❌ 403 — banned |

> **Important:** Enabling WoT **replaces** the legacy `joinMode` field
> (`open` / `invite-only`). When `wotEnabled = true`, `joinMode` is ignored
> and the only paths into the server are the four "✅" rows above.

### Existing-member grandfathering

Once a user has joined the server, they keep their membership even if the
referente later unfollows them. This is intentional: the WoT controls
**entry**, not ongoing membership. To remove a member, use the existing
ban / kick admin tools.

### Cache & refresh strategy

Fetching kind 3 from relays on every login would be slow and unreliable. The
follow list is cached in the `WotEntry` table and refreshed lazily:

- **On login**: if the cache is older than 6 hours, a background refresh is
  fired (best-effort, never blocks login).
- **From the admin panel**: the "Refresh WoT" button forces an immediate
  refresh and shows the diff (`+added / -removed / total`).
- **On referente change**: setting a new `referentePubkey` clears
  `referenteFetchedAt`, so the next access triggers a fresh fetch.

If relays are unreachable, the previous cache stays valid — login does not
break.

### Override list

Admins can manually whitelist npubs that aren't in the referente's WoT.
Common use cases:

- A new community member the referente hasn't followed yet.
- A user the referente intentionally doesn't follow on Nostr but should be
  allowed in the chat.
- Bots or service accounts.

Each override stores the admin who added it, an optional reason, and a
timestamp.

---

## Tenure-based invite credits

### Eligibility

A member becomes eligible to mint invites when:

```
daysAsMember >= server.minDaysActive
```

- `daysAsMember` = `(now − member.joinedAt) / 1 day`

If the threshold is unmet, the API returns the remaining gap and the UI
shows "You can invite friends after being a member for X days (Y remaining)".

### Credit pool

Each eligible member gets `server.invitesPerUser` total credits (default 3).
The available count is:

```
remaining = max(0, invitesPerUser − count(invitations created by this member in this server))
```

Set `invitesPerUser = 0` to disable member invites entirely.

### Forced constraints on member-minted invites

When a regular member mints an invite, the API forces:

- `maxUses = 1` — single-use only.
- `expiresAt = now + server.inviteExpiryHours` — bounded lifetime (default 7 days).
- `targetPubkey = null` — member invites are open (no targeting).

Admins can pass any value for `maxUses` / `expiresInHours` / `targetPubkey`
and are not counted against any pool.

### UI

- **Admin panel** (`/admin → Access`): "Member Invites" policy section lets
  owners configure `invitesPerUser`, `inviteExpiryHours`, `minDaysActive`,
  or disable member invites entirely. The invite list shows "By [npub]"
  for each invite so admins can see who created what.
- **Channel sidebar**: "Invite Friends" button opens the `MemberInviteCard`
  showing remaining credits, a generate button, and the member's own invites.
- **`GET /api/servers/:serverId/my-invites`**: member endpoint returning
  credit status and the member's own invite list.

---

## Configuration reference

All settings live on the `Server` row and are managed from `/admin → Access`.

| Field                 | Default | Meaning                                                                |
|-----------------------|---------|------------------------------------------------------------------------|
| `referentePubkey`     | `null`  | The npub whose kind 3 follow list defines the server's WoT             |
| `wotEnabled`          | `false` | Master switch. When `true`, replaces `joinMode`                        |
| `referenteFetchedAt`  | `null`  | Timestamp of the last successful WoT cache refresh                     |
| `minDaysActive`       | `7`     | Days since joining required for invite eligibility                     |
| `invitesPerUser`      | `3`     | Total credit pool per eligible member (0 = disabled)                   |
| `inviteExpiryHours`   | `168`   | Forced expiry for member-minted invites (default 7 days)               |

`referentePubkey` and `wotEnabled` can only be edited by the server **owner**.
The activity-policy fields (min* / invitesPerUser / inviteExpiryHours) are
also owner-edited but admins can read them.

---

## API reference

All routes return JSON. Auth is via the existing `session` cookie.

### `GET /api/servers/:serverId/access`
Read current access config. **Auth:** admin+.
**Returns:** `{ referentePubkey, wotEnabled, referenteFetchedAt, joinMode, invitesPerUser, inviteExpiryHours, minDaysActive }`.

### `PATCH /api/servers/:serverId/access`
Update access config. **Auth:** owner only.
**Body:** any subset of `{ referentePubkey, wotEnabled, invitesPerUser, inviteExpiryHours, minDaysActive }`.
Setting `referentePubkey` resets `referenteFetchedAt` so the next access triggers a refresh.

### `GET /api/servers/:serverId/wot-check`
Check whether the authed user is in the server's WoT. **Auth:** any session.
Triggers a background `maybeAutoRefreshWot` if the cache is stale.
**Returns:** `{ wotEnabled, hasReferente, allowed: boolean, reason: 'follow' | 'override' | 'none' }`.

### `POST /api/servers/:serverId/wot-refresh`
Force-refresh the cached follow list from Nostr relays. **Auth:** admin+.
**Returns:** `{ added, removed, total, fetchedAt }` or `400` with an error message if the referente isn't set or relays fail.

### `GET /api/servers/:serverId/wot`
List cached WoT entries. **Auth:** admin+.
**Query:** `take` (max 200, default 50), `skip` (default 0), `search` (substring filter on pubkey).
**Returns:** `{ entries, total, take, skip, server }`.

### `GET /api/servers/:serverId/wot/overrides`
List manual overrides. **Auth:** admin+.
**Returns:** `{ overrides }`.

### `POST /api/servers/:serverId/wot/overrides`
Add or update an override. **Auth:** admin+.
**Body:** `{ pubkey: string, reason?: string }`.
**Returns:** `{ override }` (201).

### `DELETE /api/servers/:serverId/wot/overrides?pubkey=...`
Remove an override. **Auth:** admin+.
**Returns:** `{ ok: true }`.

### `GET /api/servers/:serverId/my-invites`
Get the authed member's credit status and their own invites. **Auth:** any member.
**Returns:** `{ eligible, used, total, remaining, minDaysActive, memberSince, invites: [...] }`.

### `POST /api/servers/:serverId/invitations`
Create an invitation. **Auth:** any member.
- **Admins+:** full flexibility over `{ maxUses, expiresInHours, targetPubkey }`.
- **Members:** must meet tenure threshold and have remaining credits. Invites are forced to `maxUses=1`, auto-expiry, no `targetPubkey`. Returns `403` if ineligible or out of credits.

### `GET /api/servers/:serverId/invitations`
List all invitations. **Auth:** admin+.

---

## Data model

New tables (see `prisma/migrations/20260410120000_wot_and_invite_credits/`):

```prisma
model WotEntry {
  id        String   @id @default(cuid())
  serverId  String
  pubkey    String   // a pubkey the referente follows
  addedAt   DateTime @default(now())
  server    Server   @relation(fields: [serverId], references: [id], onDelete: Cascade)
  @@unique([serverId, pubkey])
  @@index([serverId])
  @@index([pubkey])
}

model WotOverride {
  id        String   @id @default(cuid())
  serverId  String
  pubkey    String
  addedBy   String
  reason    String?
  createdAt DateTime @default(now())
  server    Server   @relation(fields: [serverId], references: [id], onDelete: Cascade)
  @@unique([serverId, pubkey])
  @@index([serverId])
}
```

New fields on `Server`:

```
referentePubkey     String?
wotEnabled          Boolean   @default(false)
referenteFetchedAt  DateTime?
minDaysActive       Int       @default(7)
invitesPerUser      Int       @default(3)
inviteExpiryHours   Int       @default(168)
```

New field on `Member`:

```
lastActivityAt  DateTime?
```

---

## Operational notes

- **Relay failures don't break login.** `maybeAutoRefreshWot` swallows
  errors silently, and the WoT cache remains valid until the next successful
  refresh. Login uses the cached `WotEntry` rows directly via `isInWot()`.
- **No cron required.** Refresh is lazy: triggered on user logins (when cache
  > 6h old) and on the admin "Refresh WoT" button. If you operate a high-
  activity server you may want to add a periodic refresh later, but it is not
  necessary for correctness.
- **Credit counts are computed on demand.** The source of truth is the count
  of `Invitation` rows created by the member. This is a simple indexed query.

## Threat model

**What this defends against:**
- **Spam accounts.** A new spam npub with no social presence will not be
  followed by the referente, will not be on the override list, and cannot
  produce activity without first being admitted — so they can never get in.
- **Sybils.** Even if an attacker creates many npubs, none of them are in
  the WoT, and producing the activity required for credits takes real days
  of real participation.
- **Admin bottleneck.** Communities don't have to depend on admins manually
  vetting every signup — trusted members can vouch via invite credits.

**What this does NOT defend against:**
- **Referente account compromise.** If the referente's Nostr key is stolen
  and the attacker publishes a new kind 3 with malicious follows, the next
  refresh will admit them. Mitigation: use a cold-stored referente key, or
  override-list trusted core members directly.
- **Trusted-member collusion.** A bad actor inside the WoT can spend their
  credits on more bad actors. Mitigation: lower `invitesPerUser`, raise
  `minDaysActive` / `minMessages`, or revoke specific invites.
- **Off-platform identity theft.** WoT only verifies that *some* npub is
  followed by the referente. It does not verify that the human behind the
  npub matches expectations.

## Future work

- **Invitation graph visualization** in `/admin → Invitations` (who invited
  whom, downstream subtree per inviter).
- **Decay of unused credits** (e.g. credits expire if not used within N
  days, freeing the slot).
- **Multiple referentes per server** with quorum logic ("must be followed
  by at least 2 of 3 referentes").
- **Webhook on WoT change** so external systems can react.
- **Credit decay** — unused credits expire after N days, freeing the slot.
