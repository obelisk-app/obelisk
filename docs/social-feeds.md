# Social feeds (Nostr-proper)

Obelisk is a NIP-29 group-chat app, but it also reads and writes **ordinary
Nostr** — kind-1 notes, profiles, reposts, reactions, zaps. That is a
completely separate protocol surface from group chat, and this doc is the
contract for it.

Read together with [data-system.md](./data-system.md) (the bridge and its
relay tiers) and [uploads.md](./uploads.md) (Blossom).

---

## 1. Social is a fourth relay tier

CLAUDE.md's "Single-relay rule" lists three relay tiers. Social is a fourth,
and mixing it with the others is the failure mode to avoid:

| Tier | Relays | Carries |
|---|---|---|
| Group | `configuredRelays` / `currentRelayUrl` | NIP-29 kinds 9, 39000-39002, … |
| Profile lookup | `DEFAULT_PROFILE_LOOKUP_RELAYS` | bounded kind-0 / 3 queries |
| DM | NIP-65 read+write union | kinds 4, 1059 |
| **Social** | `preferences.socialRelays` | **kinds 1, 6, 7, 16, 20, 21, 22, 1111, 9735, 9802, 30023** |

Rules:

- Social reads **never** touch the active group relay and never go through
  `useConfiguredRelays()`. Fanning a kind-1 REQ across configured relays
  opens authenticated sockets to whitelist-gated NIP-29 relays and produces
  the documented `Tried to send AUTH on a closed connection` loop.
- Social writes go out as
  `bridge.publishEvent(tpl, { extraRelays: socialRelays(), mode: 'replace' })`.
  `'replace'` — not the default `'merge'` — is what keeps kind-1 traffic off
  the group relay.
- Group traffic is never published to social relays.

Relay config is `preferences.socialRelays`: 1–8 entries, validated with the
SDK's `isPublicWssUrl`, edited in `settings/SocialRelaySettings.tsx`.
It replaced `profileFeedRelays`, which was hard-locked to exactly three
(`parseProfileFeedRelays` returned `null` for any other count). The old key is
still read once on migration.

---

## 2. Module map (`src/lib/social/`)

| File | Owns |
|---|---|
| `relays.ts` | normalize / validate / cap the relay list, `socialRelayKey` cache namespace |
| `pool.ts` | `initSocial`, the shared `@nostr-wot/data` pool + coalescer, NIP-65 import |
| `feed.ts` | `loadFollowingFeed` / `loadGlobalFeed` / `loadProfileFeed`, `mergeNotes`, `until` cursor |
| `cache.ts` | bridgeCache write-through (seed → paint → debounced write) |
| `useFeed.ts` | the React lifecycle: seed, fetch, live tail, paginate |
| `engagement.ts` | batched reply/repost/reaction/zap counts |
| `publish.ts` | **every write, and the single source of truth for tag shapes** |
| `nip27.ts` | `nostr:` URI parse/encode |
| `imeta.ts` | NIP-92 parse |
| `repost.ts` | kind 6/16 resolution + dedupe |
| `sensitive.ts` | NIP-36 detection |
| `kinds.ts` | which kinds a feed requests and how each renders |

**One pool.** Everything reads through `sharedCoalescer` on the SDK's
`getPool()`. Before this, `NostrProfile` did `new SimplePool()` in a mount
effect, so two open profiles meant two independent socket sets and closing
the component destroyed any warm connection.

---

## 3. Caching

`obelisk-cache-v4/<socialRelayKey>/1/<feedId>` where `feedId` is
`feed:following`, `feed:global`, or `profile:<pubkey>`.

- Seeded synchronously in a **layout** effect, so cached notes appear in the
  first frame rather than after a flash of skeletons.
- Written through with a 200 ms debounce, capped at `FEED_CACHE_LIMIT` (50).
- Signatures are **not** stored — nothing re-verifies a cached note, and
  `sig` roughly doubles the payload on a quota-limited origin.
- Keyed by relay **set** (sorted, so member order doesn't split the cache).
  Notes read from one relay set are never painted for another.
- Swept by the existing `obelisk-cache-v4/` prefix in `cache-clear.ts`. The
  SDK's own TTL cache (`obelisk-social-sdk/`) is swept alongside it.

The old behaviour, for contrast: notes lived in `useState` behind a
`key={pubkey:relays}` remount, so any navigation threw them away. The shipped
i18n string said "feed events are not cached".

---

## 4. Wire format — what other clients expect

`publish.ts` is the only place tag shapes are constructed, and
`publish.test.ts` asserts them. A malformed tag is invisible locally; it shows
up as a thread that Amethyst, Damus and Primal each scatter differently.

| Action | Kind | Shape |
|---|---|---|
| Reply | 1 | Marked NIP-10 only. Top-level reply carries **root only**; nested carries root + reply. `p` = parent's whole `p` set ∪ parent author — dropping it is why a reply "doesn't notify". Never positional e-tags. |
| Repost | 6 | `content` = stringified original (spec allows empty, but empty renders as a blank card); `e` + `p`. Keep the `e` tag even when embedding — Primal's empty-repost rescue path reads it. |
| Quote | 1 | `q` tag + inline `nostr:nevent…`. **Not** an `e` tag with a `mention` marker — that gets pulled into the thread as a reply. |
| Reaction | 7 | content `"+"`. An emoji is explicitly *not* a like per NIP-25, so a heart undercounts the note elsewhere. `e` + `p` + `k`, plus `a` **alongside** `e` for addressable targets. |
| Delete | 5 | `e` + `k`, own notes only. |
| Mentions | — | `nostr:` URI inline **and** the `p` tag — tags are spec-optional but they're what delivers the notification. |
| Media | — | `imeta` (`url m dim x alt`) **and** the bare URL in content. |
| Hashtags | — | lowercase `t`. |
| Content warning | — | `content-warning` **and** `["t","nsfw"]`. |

### Client quirks worth knowing

These are why several of the rules above are not simply "follow the NIP":

- **Damus has no NIP-36 support at all.** The only sensitive-content signal
  that reaches a Damus user is the `#nsfw` hashtag, which is why
  `contentWarningTags` emits both.
- **Damus's imeta parser** splits each field on every space and discards the
  whole tag unless it gets exactly two tokens — so a multi-word `alt` costs
  Damus readers the `dim` and `blurhash` too. We still write `alt`
  (accessibility wins, and it's usually absent), but that's the tradeoff.
  Our parser uses `split(' ', limit 2)` over a multimap, because values
  contain spaces and keys repeat (`fallback`).
- **Damus copies every `e` and `p` tag** off the target into its reactions and
  appends the real target last. Read reaction targets **last-wins**.
- **Primal iOS emits `a` instead of `e`** on reactions to addressable events,
  and Damus only reads `e` — so those reactions are invisible there. Emit both.
- **Primal drops kind-6 reposts** whose embedded event isn't kind 1.
- **Amethyst** publishes the widest kind set; a feed that renders only kind 1
  is visibly shorter than Amethyst's for the same follow set.
- **Mute lists**: writing private (encrypted) NIP-51 entries makes them
  invisible to Damus and Primal, and Primal iOS wipes the encrypted `content`
  when it republishes. Obelisk keeps mutes local for now — see
  `settings/MutedAndBlocked.tsx`.

### Outbox (NIP-65)

`fetchNotesByAuthor` unions defaults with the author's NIP-65 **write**
relays, so single-author reads and publishing get outbox routing. The
**Following** feed deliberately does not: resolving NIP-65 per author across
a 1000-follow list means a thousand kind-10002 lookups and hundreds of
sockets. Following queries the configured social relay set only.

---

## 5. Surfaces

- **`FeedScreen`** — Following / Global tabs. Desktop: rail tile directly
  below the DM arrow (`View = { kind: 'feed' }`). Mobile: a real top-level
  tab, `NAV_ORDER = ['server','feed','dms-list','inbox','settings-profile']`.
- **`NostrProfile`** — the same feed scoped to one author, plus
  posts/replies/media tabs and follow.
- **`NoteCard`** — shared row. Reply, repost, quote, react, zap, ⋯; per-kind
  rendering (reposts resolve their target, long-form is a card, highlights are
  attributed quotations, picture notes size themselves from `imeta`).
- **`NoteThread`** — parent chain + replies, via `fetchThread`.

New notes from the live tail are buffered behind a "N new notes" pill rather
than spliced into the list under a reading user.

---

## 6. Adding to this surface

1. Decide the relay tier first. If it isn't DMs and isn't NIP-29, it's social
   and it uses `socialRelays()` — never `useConfiguredRelays()`.
2. Put any new tag construction in `publish.ts` and assert it in
   `publish.test.ts` against a named client behaviour.
3. If a new kind should appear in feeds, add it to `FEED_KINDS` **and** give
   it a `renderModeFor` case — otherwise it requests over the wire and then
   renders as "unsupported".
4. Cache anything that benefits from instant first paint via `cache.ts`, and
   confirm the key includes the relay set.
