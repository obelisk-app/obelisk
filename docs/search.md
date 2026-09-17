# Message Search

Obelisk searches messages, users, and channels from one bar, over NIP-50
(`search` filter) against the **active relay only**.

There is no server, no API route, and no database. Everything below runs in
the client against the relay.

> Earlier revisions of this document described a Prisma/`GET /api/search`
> stack. That stack no longer exists — see [data-system.md](data-system.md).

## Surfaces

| Surface | File | Searches |
|---|---|---|
| Desktop bar | `src/app/app/SearchBar.tsx` | messages + users + channels |
| Mobile screen | `SearchScreen` in `src/app/app/mobile/PhoneShell.tsx` | messages + channels |
| Publications search-or-create | `src/components/chat/ForumView.tsx` | thread titles in the current container (local, no relay query) |

Users are resolved separately by `src/lib/hooks/useNostrUserSearch.ts`: NIP-19
decode, NIP-05 `.well-known` lookup, and a kind-0 NIP-50 query against
indexer relays. That is profile discovery, so — like the bridge's
`DEFAULT_PROFILE_LOOKUP_RELAYS` — it is allowed to leave the active relay.
Message search never is.

## Grammar

Parsed by `src/lib/search-query.ts` (`parseSearchQuery`), shared by both
shells.

| Filter | Syntax | Notes |
|---|---|---|
| From user | `from:alice`, `from:npub1…`, `from:<hex>` | display name resolved against relay members |
| In channel | `in:general`, `in:<groupId>` | channel name resolved against your channels |
| Mentions | `mentions:bob` | `#p` tag filter |
| Has content | `has:link`, `has:image`, `has:file` | matched on message content, client-side |
| Before date | `before:2026-04-01` | `until` — UTC midnight |
| After date | `after:2026-03-01` | `since` — UTC midnight |
| Exact phrase | `"deployment failed"` | one literal term, never split |
| Free text | `hello world` | terms ANDed |

A token whose value can't be resolved (`from:nobody`, `before:yesterday`,
`has:video`) is **reported in the results pane**, not silently dropped.
Quoting a token (`"from:alice"`) searches for it as literal text.

## How multi-word search actually works

This is the part worth understanding, because it constrains what the UI can
promise.

NIP-50 leaves `search` semantics entirely up to the relay. The relays Obelisk
ships against match the value as a **literal substring of the whole string**,
case-insensitively — not as tokens. Measured against
`wss://public.obelisk.ar`:

| Filter | Events |
|---|---|
| `search:"the"` | 16 — matches inside words, e.g. "in **the**ory" |
| `search:"a"` | 50 |
| `search:"hola"` / `search:"HOLA"` | 1 each — case-insensitive |
| `search:"hola mundo"` | **0** |
| `search:""` | 0 |

So sending a user's raw query straight through means **any multi-word search
returns nothing**. Instead:

1. `relaySearchTerm()` picks the **longest** term and sends only that as
   `search` — the most selective needle, and cheapest on a substring matcher.
2. `matchesTerms()` applies the full AND across every term client-side.
3. Quoted phrases pass through intact, since a literal substring match is
   exactly what these relays are good at.

Because steps 2 and 3 discard events the relay already counted against
`limit`, `searchMessages` **over-fetches** (`SEARCH_OVERFETCH_FACTOR`, capped
by `SEARCH_MAX_FETCH`) whenever a client-side filter is active, then trims to
`limit`. Without that, `has:image` would fetch the 30 newest messages, throw
away 29, and read as "no results".

### Relays without NIP-50

A relay that doesn't implement NIP-50 does not error — it **ignores the
`search` field** and returns unfiltered recent events. Presenting those as
hits would be silently wrong, so the bar reads `supported_nips` from the
relay's NIP-11 document (`supportsSearch` in `src/lib/relay-info.ts`), omits
`search` when 50 is absent, filters entirely client-side, and tells the user
that only recent messages were scanned.

## Scope

Message search is **relay-wide by default**, across all channels on the
active relay. A toggle in the results header narrows it to the current
channel, and an explicit `in:` token always wins.

This stays on the active relay, per the single-relay rule in
[CLAUDE.md](../CLAUDE.md) — search never fans out across configured relays.

## Results

- Messages show author (display name, else `npub1…` — never a raw hex
  prefix), channel, timestamp, and a two-line content preview.
- Newest first. NIP-50 relevance ordering is relay-defined and not relied on.
- `Load more` pages by re-querying with `until` = oldest result's
  `created_at` − 1, and only appears while the result set is partial.
- Clicking a result — or highlighting it with ↑/↓ and pressing Enter —
  raises `pendingJump` on the chat store. The shell switches channel and
  reuses the same scroll-and-flash path as the `?m=` deep link, which waits
  for the message to load before scrolling.

## Keyboard

| Key | Action |
|---|---|
| `↓` / `↑` | Move through message results |
| `Enter` | Jump to the highlighted result (or run the query, committing it to history) |
| `Escape` | Clear the query; again to close the pane |

The input is a `role="combobox"` with `aria-activedescendant` pointing at the
highlighted `role="option"`; the result count is `aria-live="polite"`.

## Behaviour notes

- **Live.** Message search is debounced (250 ms) and runs as you type, like
  the Users and Channels sections beside it.
- **No stale overwrites.** Every query carries a sequence id; a slow earlier
  response that lands after a newer one is dropped, and results, errors, and
  the count are cleared the moment the query changes.
- **History** records only explicit commits (Enter or the submit button), not
  every keystroke prefix, and appears immediately.

## Limitations

- **Substring, not full-text.** No stemming, ranking, or relevance ordering —
  `has:image` on the relay side is impossible, and `the` matches `theory`.
- **`has:` uses heuristics** — it looks for URL/extension patterns in message
  content, not attachment metadata. "I like .jpg files" matches `has:image`.
- **`from:` / `in:` resolve to the first partial match** among known relay
  members and your channels. Someone who has never appeared in a member list
  can only be targeted by npub or hex.
- **No boolean operators.** AND is implicit; OR and NOT are unsupported.
- **Publication titles** aren't searched by the message bar — only message
  content. The search-or-create bar inside a publications channel filters
  titles locally.

## Tests

- `src/lib/search-query.test.ts` — grammar, phrases, dates, term splitting,
  AND matching, unresolved tokens.
- `src/lib/nostr-bridge/bridge.test.ts` (`describe('searchMessages')`) —
  single-term relay filter, over-fetch before `has:`, trim + partial flag,
  phrase contiguity, NIP-50-absent fallback.
- `src/app/app/SearchBar.test.tsx` — debounce, race, stale clearing, scope
  toggle, keyboard, paging, jump.
- `src/app/app/mobile/search-screen.test.tsx` — mobile parity.
