# Known Bugs & Tech Debt

Canonical list of open bugs and tech debt in Obelisk. Fixes are tracked here until shipped; items that grow into full initiatives get promoted to the [ROADMAP.md](../ROADMAP.md) phases.

## Realtime & presence

- **Online users not updating** — all users appear online regardless of actual status. Presence state is not driven by socket connect/disconnect events.
- **Nuevo miembro no aparece en tiempo real en la member list** — when Bob joins a server where Alice is already connected, Alice does not see Bob in the sidebar until she reloads (or until Bob sends a regular message, which embeds his profile in the `new-message` payload). Fix: emit a `member-joined` event from `server.ts` on the join route and the invitations route with `{ pubkey, displayName, picture, nip05, role }`, and add a listener in `src/app/chat/page.tsx` that appends to `memberList` + `profileCache`. Filter by `serverId` so other servers Alice is in are not polluted.
- **Lateral member list does not update per server** — switching servers must reload members, roles and online state for the server the user is now viewing.

## Rendering & UI

- **`MessageBubble` ignores the embedded `message.author`** — `src/components/chat/MessageArea.tsx:213-214` resolves avatar/name only via `profileCache.get(authorPubkey)`, discarding the profile the server already attaches on each `new-message` emit (see `getAuthorProfile` in `src/lib/profile-sync.ts:255`). The first message from a never-seen user renders with the fallback letter until the seed in `chat/page.tsx:426-445` reaches the cache and re-renders. Fix: priority chain `message.author?.picture ?? profileCache.get(pk)?.picture` (same for `displayName`).
- **Channel load restores `lastSeen` even when not needed** — `src/app/chat/page.tsx:403-418` always queues a pending highlight from `localStorage['chat:lastSeen:<channelId>']` on initial mount. If that message isn't in the latest page, `fetchMessages` refetches with `?around=<id>` (line 1192) and the user lands in old history instead of at the bottom. Restore only when the URL has `?m=`, or fall back to latest page when the stored id is outside it.
- **`UserPanel` ↔ `MessageInput` altura/alineación visual** — the profile bar at the bottom of `ChannelSidebar` does not line up in height with the message input bar (`px-2 md:px-4 pb-3 md:pb-4 pt-2` in both, avatar `h-8` vs textarea `rows=1`). Attempts (`leading-tight`, moving `UserPanel` in/out of the aside, `bg-lc-dark` on wrapper) leave a black strip between the channel list and the profile card. Likely fix: force explicit shared height (e.g. `h-12`) on both inner containers and ensure the `UserPanel` wrapper inherits `bg-lc-dark` from the aside without painting under the `ServerBar`.
- **Forum channels look like the opened tab even after clicking outside** — navigating from a forum channel to a regular channel does not clear the forum channel's selected state in the sidebar. Does not happen between regular channels.
- **Bienvenida channel renders badly on refresh** — initial load in the welcome channel loads elements in the wrong order.
- **Replies don't link back to the replied message, and show raw npubs for mentions** — inline reply previews render mentions as `npub:kjasd...` instead of the Nostr display name, and clicking the preview does nothing. The target message is not focused/scrolled-to.
- **Bot role priority in the member list cannot be reordered** — bot sidebar position depends on role order, but /admin → Roles does not expose drag-and-drop or up/down reordering for bot roles. Fix: expose role `position` reordering (including bot-assigned roles) and have the member list respect it.
- **Anonymous name for users without server membership** — a user who logs in without joining any server shows as "Anonymous" on their own client even when their Nostr metadata has a name and picture. The /admin panel also skips their profile picture when they are not already a server member. Likely cause: profile fetch is gated on membership.
- **Mentions autocomplete leaks private/hidden channel membership** — `@user` autocomplete must filter results to users who can read the current channel. In private/hidden channels, only members with read access should appear; otherwise membership of hidden channels is inferred and mentions can be created that the target cannot see.

## Voice

- **SFU voice is not end-to-end encrypted** — `mesh` channels are fine: WebRTC wraps every track in DTLS-SRTP peer-to-peer, so the relay only ever sees signaling. `sfu` channels (LiveKit) are DTLS-SRTP from publisher → server and re-encrypted server → subscribers, meaning the self-hosted SFU sees decrypted media in transit. LiveKit E2EE (insertable streams) is not wired up in `src/lib/livekit-voice.ts`. Either enable it for parity with mesh, or surface a clear "not E2EE" indicator in the voice UI when `voiceMode === 'sfu'`.
- **Voice presence beacons and signaling are plaintext on the relay** — `src/lib/voice/transport.ts` publishes presence beacons (kind 20078) and WebRTC signaling (kind 25050) as signed but unencrypted ephemeral events. Beacons leak `{pubkey, channelId, timestamp}` every ~15s while a user is in voice — any relay subscriber can build a real-time roster of who is in which voice channel and reconstruct session timing. Signaling events are worse: `content` is plaintext JSON containing SDP + ICE candidates, so the relay (or any subscriber filtering `kinds:[25050], #e:[channelId]`) sees codec fingerprints and harvested local/public IPs; the `#p` target is only enforced client-side (`transport.ts:144`). Media itself is fine (DTLS-SRTP peer-to-peer in mesh). Fix: wrap both kinds in NIP-59 gift-wrap (or NIP-44 to the addressed peer for signals); the transport file already flags this as a v1 shortcut. Until then, treat voice channel membership and participant IPs as public to anyone watching the relay.
- **`docs/voice-system.md` is stale re: signaling transport** — the doc still describes Socket.io + `server.ts` for mesh signaling and capacity claims, but the app is relay-only per CLAUDE.md (no `server.ts`, no `/api/*`). Audit the voice client against the current Nostr-relay signaling path and rewrite the doc; until then, threat-model statements about "signaling stays on the relay" should be verified against code, not the doc.

## Notifications

The read-state foundation (server-side `lastReadAt`, in-app toasts via `ToastStack`, unread bullets, "new messages" separator, favicon badge, title counter, bech32 + reply mention detection via `extractMentionPubkeys`) is built but buggy in practice. Known issues:

- **`/api/unread` returns a binary count for DMs** — today it returns `1` or `0` per thread instead of the real unread message count.
- **General notification reliability** — notifications do not fire consistently. Needs an audit of the full path (socket emit → store → toast + favicon + title) against the actual triggers (new message in subscribed channel, @mention, reply to own message, DM). Specific reproduction steps to be added as they are observed.
- **Welcome message does not fire for existing users joining a new server** — the welcome bot only triggers via the join endpoint; auto-join flows (e.g. WoT auto-registration) bypass it. Verify that auto-join creates a Member record and then invokes the same welcome-message hook as the explicit join route.

## Ergonomics / small UX

- **Scroll to last message button** is missing when a channel has many unread messages.
- **Navigate between mentions** — when a user has several mentions in a long chat, provide a floating `N mentions ↑↓` control (Discord-style) that jumps to prev/next without marking all as read. Keyboard shortcuts `F7` / `Shift+F7` and clicking the unread-mention badge should drive the same navigation.

## Admin

- **No way to delete servers from /admin** — once a server is created there is no UI path to remove it. Schema-wise, `Server` already cascades deletes to its children, so the API/UI is the only missing piece.

## Schema / tech debt

- **`Channel.emoji` should be folded into `Channel.name`** — emoji and name are stored as separate columns in admin, forcing every renderer to stitch them (`<ChannelEmoji value={channel.emoji} /> {channel.name}`) and complicating slugs, share-links and mentions. Migrate admin UX so the emoji is typed inline in the single name input (e.g. `💬 chat-general`), store it inline in `name`, and drop the `emoji` column in a follow-up migration.
- **Deployed La Crypta server is behind `prisma/seed.ts`** — welcome message in `empezá-acá`, posts of `indice` (reglas/actividades/proyectos/redes), posts of `méritos` (plantillas de reclamo), channel descriptions, emojis, tags, etc. are hardcoded in the seeder and only applied at initial creation. There is no way to edit them from the UI, and re-running the seeder does not update existing rows. Fix tracked in [content-migration-plan.md](content-migration-plan.md).
