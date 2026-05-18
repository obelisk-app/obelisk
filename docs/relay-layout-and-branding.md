# Relay layout & branding (operator-controlled, shared)

Two NIP-78 (kind 30078) replaceable parameterized events let admins control
what every user sees for a given relay:

- **Layout** — categories + channel ordering. `src/lib/channel-layout.ts`
- **Branding** — relay icon, banner, display name, description.
  `src/lib/relay-branding.ts`

Both follow the same "shared, multi-author, latest-wins" model.

Relay custom emojis use the same author-set model, but they are stored as
NIP-51 `kind:30030` emoji-set events instead of NIP-78. See
[relay-custom-emojis.md](relay-custom-emojis.md).

## Storage

| What | Kind | d-tag |
|---|---|---|
| Layout | 30078 | `obelisk:layout:<relayUrl>` |
| Branding | 30078 | `obelisk:branding:<relayUrl>` |

Layout tags:

```
["category", catId, name, position]
["channel",  channelId, catId|"", position]
```

Branding tags: `["icon", url]`, `["banner", url]`, `["name", text]`,
`["description", text]`.

## Who can edit (the "authors" set)

The set of pubkeys whose events this client will accept as authoritative
for a given relay is computed in `AppShell.tsx → Sidebar`:

```
relayAuthors = union of:
  - every pubkey appearing in any kind 39001 admin list for any visible
    group on this relay (NIP-29 admins, claimed via kind 9000 with role
    'admin' — see client.ts:960 createGroup → claim-admin putUser)
  - the NIP-11 operator pubkey, if the relay advertises one
```

The "categories & order" and "edit branding" buttons in the sidebar
header are gated on `myPubkey ∈ relayAuthors`. The subscription filters
`authors: [...relayAuthors]` so events from non-admin pubkeys are ignored
client-side. Latest `created_at` wins.

This is why both buttons stay hidden if you're logged in as a non-admin
even when the relay advertises an operator: the gate is symmetric with the
subscription filter, so what you can publish matches what others will
accept.

## Why not "just NIP-11 operator only"

We considered three options:

1. **Operator-only (NIP-11 `pubkey`).** Simplest, one canonical editor.
   Rejected because group admins claimed via NIP-29 (kind 9000) had no way
   to edit the relay layout, and not every relay deployment has the
   operator's nsec available to a human.
2. **First-claimer wins** (pin first author to localStorage). Rejected:
   per-device drift, hard to reset.
3. **Multi-author latest-wins** ← chosen. Any group admin can edit; the
   newest event by `created_at` is what everyone sees.

## Caveat — concurrent edits

With multiple admins, two editing at once produces last-write-wins with no
merge. If this becomes a problem, options:

- Add a soft "claim" lock (admin publishes an intent event before
  editing).
- Move to per-key sections (each admin owns a slice).
- Restrict back to the NIP-11 operator pubkey only.

Currently we ship the simple model and watch for collisions in practice.

## Code map

```
src/lib/nostr-bridge/types.ts     subscribeAdminsByGroup
src/lib/nostr-bridge/client.ts    subscribeAdminsByGroup → adminsByGroup.subscribe
src/lib/nostr-bridge/stores.ts    useAdminsByGroup
src/lib/channel-layout.ts         subscribeLayout(relay, authors[], cb)
                                  useChannelLayout(relay, authors[])
                                  publishLayout, applyLayout
src/lib/relay-branding.ts         subscribeBranding(relay, authors[], cb)
                                  useRelayBranding(relay, authors[])
                                  publishBranding
src/app/app/AppShell.tsx          Sidebar — computes relayAuthors,
                                  gates buttons, ManageLayoutModal,
                                  branding modal
```

## Operator UX

1. Log in with a pubkey that is admin of at least one NIP-29 group on
   this relay (or that matches the relay's NIP-11 `pubkey`).
2. Open `/app`, select the relay.
3. In the sidebar header, click the picture icon (branding) or the
   layout icon next to the connection dot.
4. Edit and **Publish**. The replaceable event lands on the relay; every
   client subscribed via `useChannelLayout` / `useRelayBranding` updates
   immediately.

If the buttons don't appear: your pubkey isn't in `relayAuthors` for this
relay. Either claim admin in a group (kind 9000 with `['admin']` role) or
set the relay's NIP-11 `pubkey` to your hex.
