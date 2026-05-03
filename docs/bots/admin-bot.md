# Admin Bot Pattern

An **admin bot** is a Nostr identity that holds the admin role in a NIP-29
group and emits moderation/lifecycle events on the group's behalf — welcome
messages, role grants, bans, timeouts, channel layout updates, scheduled
posts. Obelisk has no built-in moderation surface; admin bots are how you
get one.

This document is a design pattern, not a shipping bot. Use it as a
template when you need to build one.

## Capabilities granted by NIP-29

A pubkey in a group's kind 39001 (`group/admins`) list with the right roles
can publish:

| Kind | Action | Typical roles |
|---|---|---|
| 9000 | `put-user` (add member, set roles) | admin |
| 9001 | `remove-user` | admin, mod |
| 9002 | `edit-metadata` (name, picture, about, public/private) | admin |
| 9003 | `delete-event` | admin, mod |
| 9004 | `create-invite` | admin |
| 9005 | `kick-user` (one-shot remove + leave) | admin, mod |
| 9006 | `set-roles` | admin |
| 9007 | `create-group` (only matters for first-of-kind) | admin |

Roles are free-form strings agreed between admins and the relay
(`admin`, `mod`, `welcomer`, …). Convention on `relay.obelisk.ar` is
`admin` = full powers, `mod` = remove + delete only.

## Skeleton

```js
// scripts/admin-bot.mjs
import { SimplePool, finalizeEvent, nip19, getPublicKey } from 'nostr-tools';
import { useWebSocketImplementation } from 'nostr-tools/pool';
import WebSocket from 'ws';
useWebSocketImplementation(WebSocket);

const RELAY = 'wss://relay.obelisk.ar';
const GROUP = process.env.ADMIN_BOT_GROUP_ID;
const sk = nip19.decode(process.env.ADMIN_BOT_NSEC).data;
const pk = getPublicKey(sk);

const pool = new SimplePool();

// Subscribe to group activity. The relay will only deliver kind 9
// (chat) and kinds 9000-9007 (admin events) for groups we're a member of.
const sub = pool.subscribeMany([RELAY], [
  { kinds: [9], '#h': [GROUP] },          // chat messages
  { kinds: [9000, 9001], '#h': [GROUP] }, // membership changes
], {
  onevent(ev) {
    handleEvent(ev).catch(err => console.warn('handler failed:', err));
  },
});

async function publish(template) {
  const ev = finalizeEvent({ ...template, created_at: Math.floor(Date.now()/1000) }, sk);
  return Promise.any(pool.publish([RELAY], ev));
}

async function handleEvent(ev) {
  // Welcome on add: when someone is added (kind 9000 with our group),
  // post a kind 9 greeting tagged @them.
  if (ev.kind === 9000 && ev.tags.find(t => t[0] === 'h')?.[1] === GROUP) {
    const newMember = ev.tags.find(t => t[0] === 'p')?.[1];
    if (!newMember || newMember === pk) return;
    await publish({
      kind: 9,
      tags: [['h', GROUP], ['p', newMember]],
      content: `gm nostr:${nip19.npubEncode(newMember)} — welcome to the group.`,
    });
  }

  // Auto-mod example: delete messages containing a banned word.
  if (ev.kind === 9 && ev.tags.find(t => t[0] === 'h')?.[1] === GROUP) {
    if (/\bspamword\b/i.test(ev.content)) {
      await publish({
        kind: 9003,
        tags: [['h', GROUP], ['e', ev.id]],
        content: 'auto-removed: banned phrase',
      });
    }
  }
}

console.log(`[admin-bot] running as ${nip19.npubEncode(pk)} on group ${GROUP}`);
```

## Why subscribe vs poll

NIP-29 relays push events as they arrive — there is no polling endpoint.
A `SimplePool` subscription is the only way to react in real time. Don't
re-subscribe on every event; create the subscription once and let
`onevent` drive the bot's reactor loop.

## Idempotency

Relays may re-deliver events on reconnect, so handlers must be idempotent:

- Track event ids you've already acted on (in-memory `Set` is fine for a
  single-process bot).
- Don't issue a kind 9003 delete twice — the second one is a no-op but
  pollutes logs and may trigger relay rate limits.
- For "welcome on join" specifically, dedupe by `(groupId, newMemberPk)`
  not by the 9000 event id, so re-deliveries during reconnects don't
  re-greet the same member.

## Bootstrap: how does the admin bot become an admin?

The first admin is whoever published kind 9007 to create the group. After
that, admins grow the set with kind 9000 + role tag. So:

1. Create the bot's nsec.
2. Sign in to Obelisk as a human admin of the target group.
3. Publish kind 9000 with `tags: [['h', groupId], ['p', botPubkey, 'admin']]`.
4. Wait for the relay to emit a fresh kind 39001 listing the bot — at that
   point the bot's admin events will be accepted.

There is no automatic recovery if the bot's nsec is lost — rotate by
issuing 9001 remove + 9000 add for a new bot pubkey, signed by another
human admin. Don't run a single-admin group with only the bot as admin
unless you've stored the bot's nsec somewhere recoverable.

## Common admin-bot use cases

- **Welcome bot**: subscribes to kind 9000, replies with a kind 9 greeting
  and a link to the rules.
- **Role assigner**: watches a public command channel for `!grantmod
  <npub>`, verifies the requester is an admin, publishes kind 9000 with
  the new role.
- **Content moderator**: watches kind 9 with a banned-word regex, deletes
  via kind 9003. Optional: kind 9005 kick after N strikes.
- **Channel layout caretaker**: re-publishes kind 30078 (NIP-78 layout)
  whenever it drifts from a canonical configuration in the bot's repo.
- **Scheduled poster**: publishes kind 9 on a cron, e.g. weekly digest.
- **Invite gateway**: generates kind 9004 invites and posts them out-of-band
  (Slack, web form, anywhere a human can enter the group).

## Anti-patterns

- **Running an admin bot from a human's nsec.** You can't ban it without
  banning yourself, and a leak compromises your personal identity.
- **Single point of moderation.** If the bot dies, moderation halts. For
  high-stakes groups, run two bots from different hosts.
- **Implicit trust of message content.** A bot reacting to slash-commands
  (`!ban @x`) must verify the sender's role from the latest kind 39001 —
  don't assume the human sender's role hasn't changed since you last saw
  them.
- **Publishing kind 9003 (delete) for events from other relays.** NIP-29
  delete is per-relay; if the message reached a wider audience, deleting
  from `relay.obelisk.ar` only hides it locally.
