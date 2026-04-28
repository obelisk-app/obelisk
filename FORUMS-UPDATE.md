# Forums — What's Left

Status snapshot for the forum revamp. Complements `ROADMAP.md` (Fase 1.5
marks `Canales tipo foro` + `ForumView` as done at the high level but
doesn't track the Discord-parity work tackled in the recent sessions).

## Already landed

- Share-link pills (`/chat?c=slug[&p=|&m=]`) with resolved channel/post name
  + no-access lock. Smooth pushState navigation.
- Forum channels in the sidebar expand to show **followed posts** as
  indented subchannel rows with tree-connector lines.
- Cover image on posts — schema + migration, upload on new-post + edit
  modes, thumbnail on post cards, large hero on detail.
- Post editing for **author / mods / admins / owner** (title + cover image)
  via `PATCH /api/channels/:id/posts/:postId`.
- Two-pane layout: side-panel when entering from the forum index, full
  view when entering from the sidebar or deep link.
- Rich skeleton loaders on post detail.
- Infinite reply scroll (IntersectionObserver sentinel).
- OP reactions row + emoji picker + share button (native share, clipboard
  fallback) + `Esc` to close the side-panel.
- New-post modal (was an inline form).
- **DB-backed follow model** (`PostSubscription`) + API
  (`POST /api/forum/posts/:id/follow`, `GET /api/forum/posts/followed`) +
  one-time migration from the old `obelisk:followed-posts` localStorage.
- **Real `MessageInput`** in the reply composer (attachments, emoji, GIFs,
  mentions, markdown, drag-and-drop) instead of a plain textarea.
- **Reactions + emoji picker on reply rows** (hover-revealed `+` button).
- **Socket fan-out** of `post-reply` events from server.ts to every
  `PostSubscription` subscriber.

## Important missing items

Ordered by user-visible impact.

### 1. Client listener for the `post-reply` socket event
Server already emits `post-reply` to subscribers (`pubkey:<x>` room).
Nothing on the client subscribes yet, so **followed-post replies produce no
notification badge**.

- `src/app/chat/page.tsx` → register `socket.on('post-reply', …)`.
- `src/store/notification.ts` → add `postUnreads: Record<postId, number>`
  + incrementer. Bump the parent channel's unread too, via the existing
  `channelUnreads` map.
- Skip the bump when the user is currently viewing that post detail.
- Clear on open of the post.

### 2. Reply edit + delete UI
The reply row now shows reactions but has no hover three-dots menu.
Users can't edit typos in their own replies or delete them; mods can't
remove abusive replies from the forum UI (they'd have to go to the chat
channel).

- Hover toolbar on `ReplyRow` in `ForumView.tsx`: Edit / Delete / Copy text
  / Copy link.
- Reuse `src/app/api/channels/[channelId]/messages/[messageId]/route.ts`
  PATCH/DELETE — already author+mod aware and channel-scoped, so a forum
  reply (a Message row with `replyToId != null`) should just work.
- Optimistic update + rollback on failure.

### 3. Cover thumbnail in sidebar followed-post rows
`followedPostMeta[id].coverImage` is already fetched. The sidebar row still
renders the plain `📋` emoji.

- `ChannelSidebar.ForumPostRow`: swap the emoji for a `20×20 rounded <img>`
  when `post.coverImage` is truthy; keep the emoji as fallback.

### 4. UI test coverage
None of the recent ForumView UI work has tests:
- Cover image upload in the new-post form.
- Edit mode in post detail (title + cover swap, clear, save).
- Two-pane vs full-view layout (entry mode).
- `Esc`-to-close behavior.
- Reply row reactions + picker + upcoming edit/delete.
- Post-reply socket event → store badge increment.

### 5. Unapplied migrations
Both committed as SQL but not yet applied to any database:
- `prisma/migrations/20260413000000_add_message_cover_image/`
- `prisma/migrations/20260413010000_add_post_subscriptions/`

Run:
```
npx prisma migrate deploy   # prod / CI
# or
npx prisma migrate dev      # local dev
```

## Nice to have (deferred)

- Scroll-to-highlight when a reply link uses `#r=<replyId>` fragment.
- Thread-style nested replies (reply-to-reply).
- Post bookmarking / pinning from the three-dots menu.
- "Post read" bold-until-opened state on the sidebar rows.
- Forum post search.
- Cross-server `#channel` / `#post` autocomplete in message composers
  (see `ROADMAP.md` line 193: autocomplete for channels/posts/threads).
- Full `MessageBubble` extraction from `MessageArea` into a shared
  component. The current `ReplyRow` has reactions + (after #2) hover
  actions, which is close enough to chat bubbles; the extraction would be
  a pure refactor with no user-visible change.

## Cross-references

- `ROADMAP.md` Fase 1.5 tracks the high-level `Canales tipo foro` +
  `ForumView`. This file is the granular follow-up to the Discord-parity
  plan.
- Original design plan (deleted): `FORUM_PLAN.md` — phases A–H. A/B fully
  landed. C partially landed (sidebar subchannels yes; DB follow now yes
  too). D partially landed (reply composer + reactions yes; hover toolbar
  + bubble extraction no). E landed. F landed except the client
  notification listener. G landed. H only partial (API tests yes; UI
  tests no).
