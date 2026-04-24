# Forum Parity Plan

**Status:** partial. `ForumView.tsx` already reuses `MessageInput` for reply composition, but the rest of the reply path still goes through REST and re-implements features the chat path already has. Referenced from [ROADMAP.md](../ROADMAP.md).

## Why

Forum posts are **sub-chats created by users** — each post is its own channel-like thread, not a flat list of replies. `ForumView.tsx` historically re-implemented the chat UI instead of reusing `MessageArea` + `MessageInput` + Socket.io. As a result it is missing features the regular chat already supports (reactions, edits, typing indicator, pagination, realtime). The right fix is to reuse the same components inside the post detail view, not to rebuild them.

## Base refactor (architectural parity)

- Post detail view uses `MessageArea` + `MessageInput` — the same components used by regular text channels — instead of custom renderers.
- Replies travel over Socket.io (not REST), reusing the existing `message:new`, `message:edit`, `message:delete`, `message:reaction` handlers.
- The replies API returns the same shape as regular messages — `reactions`, `editedAt`, `deletedAt`, `replyTo`, full author profile. The schema already supports it; no DB change needed.

## Feature parity with regular chat

Once replies flow through the shared components, the following should work inside a post exactly as in a text channel:

- Mentions (`@user`) with autocomplete and Nostr-profile resolution.
- Emoji reactions (unicode + custom server emojis).
- Edit (author) and delete (author + mods).
- Reply / quote inside the post's reply thread.
- Typing indicator.
- "Load earlier" pagination.
- Inline multimedia (images, links, embeds, video — already partial via `MessageContent`).
- Message search within the post thread.

## Forum structure (Discord-style)

- List view: title, author, preview, thumbnail image, tags, reaction / reply counts.
- Detail view: post body + reply thread reusing `MessageArea` / `MessageInput`.
- Cover image per post.
- Tags per post + filter + sort.
- Search bar within the forum channel.

## Permissions & management

- Post author can edit their own post body.
- Moderators can edit / delete any post.
- Pin posts (mod / admin). Pinned posts appear at the top of the list.
- Post management from /admin — edit, delete, pin, tag management.

## Tests

- Reply travels through Socket.io and shows up in real time on a second client.
- Reactions / edits / deletes in a post emit the same events as a regular channel.
- `MessageInput` autocomplete (mentions, emoji, future `#channel`) works inside a forum post.
- Pagination fetches older replies without re-rendering the whole thread.
- Role guards reject unauthorized edits / deletes / pins.
