# Relay custom emojis

Obelisk stores custom emoji packs as relay-scoped Nostr events, not in a
backend table. Each relay can have its own list, and admins can copy that
list to another configured relay from the UI.

## Protocol model

There are two layers:

| Layer | Kind / tags | Purpose |
|---|---|---|
| Relay emoji list | NIP-51 `kind:30030` with `emoji` tags | The admin-managed picker list for one relay |
| Message/reaction usage | NIP-30 `["emoji", name, url]` tags | Makes each event renderable by other clients even if their local list differs |

The relay list uses a deterministic `d` tag:

```json
["d", "obelisk:emojis:<relayUrl>"]
```

Example event tags:

```json
[
  ["d", "obelisk:emojis:wss://relay.example"],
  ["title", "Obelisk emojis"],
  ["emoji", "party_parrot", "https://blossom.example/<hash>.webp"],
  ["emoji", "wave", "https://blossom.example/<hash>.png"]
]
```

Shortcode names are normalized to lowercase `a-z`, `0-9`, and `_`, up to
64 characters. File extensions are stripped when names are derived from
uploads.

## Relay scoping

The `d` tag includes the relay URL on purpose. A list published for
`wss://relay-a.example` is not reused as the canonical list for
`wss://relay-b.example`.

When an admin uses **Share** in the emoji modal, Obelisk republishes the
same emoji tags under the target relay's own `d` tag. That preserves
independent per-relay ownership while making migration/copying easy.

## Who can edit

The author set is the same model used by relay layout and branding:

- any pubkey in a visible group's NIP-29 admin list (`kind:39001`)
- the relay's NIP-11 operator pubkey, when advertised

Clients subscribe to `kind:30030` only from that author set, and newest
`created_at` wins. Events by non-admin pubkeys are ignored by the client.

## Uploads

Emoji image files are uploaded to Blossom with the existing BUD-01 upload
flow in `src/lib/blossom.ts`. The relay emoji event stores the resulting
HTTP URL in each `emoji` tag.

Supported file types in the admin UI:

- PNG
- JPEG
- GIF
- WebP

## Folder import

The relay emoji admin modal supports folder import:

1. Open `/app`.
2. Select the relay.
3. Use the relay header emoji/admin button.
4. Click **Upload folder**.
5. Choose a folder containing image files.
6. Review the generated shortcodes and click **Save**.

Folder import filters non-image files. Shortcodes are derived from
filenames:

| Filename | Shortcode |
|---|---|
| `Party Parrot.webp` | `:party_parrot:` |
| `wave.png` | `:wave:` |
| `nostr-gr.gif` | `:nostr_gr:` |

If two files normalize to the same shortcode, Obelisk appends a numeric
suffix such as `_2`.

## Rendering and interoperability

When a user sends a message containing a custom shortcode, Obelisk scans
the content and adds NIP-30 `emoji` tags for every custom shortcode used.
The same happens for custom emoji reactions.

This means old events remain renderable even if the relay's current emoji
list later changes, and other NIP-30-aware clients can render the custom
emoji from the event itself.

## Code map

```text
src/lib/relay-emojis.ts                  kind:30030 parse/subscribe/publish
src/lib/custom-emoji-tags.ts             NIP-30 tag extraction and normalization
src/components/admin/RelayEmojiAdminModal.tsx
                                         relay emoji admin UI, folder import, share
src/components/chat/EmojiPicker.tsx      custom emoji picker entries
src/components/chat/MessageContent.tsx   event-local custom emoji rendering
src/lib/nostr-bridge/client.ts           sendMessage/sendReaction emoji tags
```
