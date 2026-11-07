# Emoji, GIF, and sticker packs

Obelisk manages emoji, GIFs, and stickers as Nostr media packs. There is no
backend catalog or database: packs, favorites, and server favorites are signed
events fetched from relays and cached locally for fast first paint.

## User experience

- Open **Emoji, GIFs & stickers** directly from the signed-in user settings on desktop or mobile.
- **Marketplace** discovers public packs. **View pack** opens every item inside the same modal; it never opens a media route or browser tab.
- Selecting an item opens a larger preview with its source pack and an explicit single-item favorite action.
- **My packs** creates, edits, and deletes named packs owned by the user.
- **Favorites** contains individually saved media and packs selected with the explicit **Save pack** control.
- Use the Emoji/GIF/Sticker filters to browse or create packs of the intended
  media type.
- **Add to pack** copies a previewed item into an existing owned pack or a new pack. Pack viewers and individual favorites support selecting multiple items to copy.
- **Merge / copy items** selects one or more source packs and an owned destination. The preview reports additions, duplicates and renamed shortcode conflicts; all resulting names and types remain editable before save. Source packs are unchanged.
- Relay operators open an editable server list from server settings. **Copy pack to server** previews a snapshot, and **Edit server media** supports uploads, URLs, renaming and bulk removal. Changes require explicit save. Channel admins do not gain relay-wide authority.
- New personal packs can be saved to favorites after publishing. Empty owned packs remain editable under **My packs**.

The message-bar selector keeps its existing Emoji/GIF/Sticker interface. Its
personal sections also include the user's item favorites and items from every
favorited pack. Favoriting one item does not subscribe to the rest of its pack.
The existing **Create** sticker tile uploads into the user's editable
**My stickers** pack, creating and favoriting that pack when needed.

## Nostr contract

| Data | Kind | Identity |
|---|---:|---|
| Named media pack | `30030` | `30030:<author>:<d>` |
| User favorites | `10030` | one replaceable event per user |
| Server favorites | `30030` | `d = obelisk:emojis:<relayUrl>` by the relay operator |

### Named packs

Each user pack is a parameterized replaceable NIP-51 emoji-set event:

```json
[
  ["d", "pack-identifier"],
  ["title", "Party pack"],
  ["description", "Optional description"],
  ["image", "https://blossom.example/cover.webp"],
  ["emoji", "party_parrot", "https://blossom.example/parrot.gif", "30030:<author>:pack-identifier"],
  ["media", "party_parrot", "gif"]
]
```

The standard `emoji` tag keeps packs useful to NIP-30/NIP-51 clients. Obelisk's
`media` tag records whether an item belongs in the Emoji, GIF, or Sticker
picker; clients that do not understand it can safely treat the item as an
emoji. If the tag is missing, `.gif` URLs are inferred as GIFs and other URLs
as emoji.

Pack edits reuse the same `d` value. Newest `created_at` wins. Obelisk publishes relay-list replacements with monotonic timestamps so rapid removals cannot leave stale Server GIFs, and makes
consecutive local edits monotonic so two saves in one second cannot discard the
second edit. Deleting an owned pack publishes a NIP-09 kind 5 request with its address and removes the local cached copy and saved-pack reference.

### User favorites

The user's replaceable kind `10030` event contains:

- `['a', '30030:<author>:<d>']` for each favorited pack.
- `['emoji', '<name>', '<url>', '<optional-pack-address>']` for each
  individually favorited item.
- `['media', '<name>', 'emoji|gif|sticker']` to preserve the picker type.

Pack references stay live: edits by the pack author flow through to users who
favorited the pack. Individual favorites retain their URL and name even if the
source pack is later unavailable.

### Server favorites

Each relay keeps an independent operator-authored kind `30030` list using:

```json
["d", "obelisk:emojis:<relayUrl>"],
["a", "30030:<author>:<pack-id>"]
```

New server writes embed item snapshots using `emoji` and `media` tags, retaining source pack addresses in the optional fourth emoji-tag field. Editing or deleting a source pack does not change a saved server snapshot. Personal favorites still support live pack references.

Existing server `a` references remain readable until the operator explicitly saves a conversion. The editor resolves their addresses, combines them with existing inline items, and previews the complete list. Missing packs block conversion until fetched or explicitly excluded. The successful replacement writes all reviewed items and clears live references together. Opening settings never publishes.

Server writes verify the active relay and its operator: use the valid NIP-11 `contact` npub, falling back to `pubkey`. Personal edits also verify the original account. The editor checks the latest locally observed revision before signing; a stale draft can be merged with the current version for review. Nostr has no atomic compare-and-swap, so simultaneous writes from different devices can still race.

### Visibility and encryption

Marketplace packs and server favorites are intentionally public so other users
and servers can discover and reuse them. User favorites are also published as
standard kind `10030` tags for NIP-51 interoperability. NIP-51 supports private
lists by placing NIP-44-encrypted tags in event content, but Obelisk does not
silently mix private and public favorites. A future privacy control should
publish a clearly separate private list.

## Sending and rendering

The message picker combines individually favorited items, items from favorited
packs, and the active server's favorites. Emoji usage carries NIP-30 `emoji`
tags on the message or reaction. A standalone sticker also carries Obelisk's
validated `sticker` marker plus the NIP-30 fallback, so other clients can still
render it. GIF messages use their Blossom HTTP(S) URL. Event-local tags keep
sent content renderable if a pack or server list changes later.

Only normalized shortcode names and HTTP(S) media URLs are accepted at the
event boundary.

## Deduplication and conflict review

Assets are compared by validated HTTP(S) URLs normalized with the URL parser. Paths, query strings and fragments are preserved; no image fetching or visual similarity detection is performed. A merge retains destination metadata for identical assets, lists combined aliases in the preview, and proposes unique suffixes for distinct assets sharing a shortcode. Users can edit the final names and types before saving. Repeating a merge is idempotent.

Legacy events with conflicting shortcodes retain their distinct items when parsed. Picker composition uses deterministic unique names, while publishing normalizes names without silently dropping distinct assets. Existing messages keep their original embedded tags.

## Uploads and discovery

The pack editor accepts one or many files from the computer, uploads them through the existing Blossom BUD-01 uploader, and also supports direct HTTP(S) URLs. Events store the returned
absolute HTTP(S) URL; Obelisk does not proxy media or write upload metadata to a
database. Successful uploads remain in the draft when another file fails, and retry only resends failed files. Failed publishes retain the draft; submission is guarded against repeated clicks.

At login, the bridge subscribes to kind `30030` packs on the active relay and
profile relays, plus the current user's kind `10030` favorites. Parsed packs and
favorites use the existing local `bridgeCache` as stale-while-revalidate data. Referenced packs are also subscribed by author and identifier, outside the discovery window. Successful writes immediately update bridge state and cache.

## Code map

```text
src/utils/media/tags/media-packs.ts                       parse and serialize packs/favorites
src/services/nostr-bridge/facade/client.ts               subscribe, ingest, publish, and cache
src/components/media/library/MediaLibraryModal.tsx   marketplace, packs, favorites, one-time import
src/components/chat/picker/MessageMediaPicker.tsx   merged Emoji/GIF/Sticker data
src/services/relay/relay-emojis.ts                      operator-owned server favorites
src/utils/media/tags/custom-emoji-tags.ts                 NIP-30 validation and message tags
src/utils/media/tags/sticker-tags.ts                      standalone sticker marker and fallback
```
