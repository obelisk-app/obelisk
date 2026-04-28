# Message Search

Obelisk includes a Discord-style message search engine with filter operators, real-time results, and jump-to-message navigation.

## How to Use

Click the **search icon** (magnifying glass) in the top bar of any channel. This expands into a search input field.

### Basic Search

Type any word or phrase to search across all messages in the current server:

```
hello world
```

This finds messages containing **both** "hello" and "world" (AND logic).

### Exact Phrases

Wrap text in double quotes to match an exact phrase:

```
"deployment failed"
```

### Search Filters

Filters narrow results by specific criteria. Type a filter prefix (e.g., `from:`) and a value with no space between them. Filters can be combined with each other and with free text.

| Filter | Syntax | What it does |
|--------|--------|--------------|
| **From user** | `from:alice` | Messages sent by a user (matches display name, partial match) |
| **In channel** | `in:general` | Messages in a specific channel (partial match on channel name) |
| **Has content** | `has:link` | Messages containing a specific content type |
| **Before date** | `before:2026-04-01` | Messages sent before a date (YYYY-MM-DD) |
| **After date** | `after:2026-03-01` | Messages sent after a date (YYYY-MM-DD) |
| **Mentions** | `mentions:bob` | Messages that mention a user by name |

#### `has:` values

| Value | Matches |
|-------|---------|
| `link` | Messages containing any URL (`http://` or `https://`) |
| `image` | Messages containing image URLs (`.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`) |
| `video` | Messages containing video URLs (`.mp4`, `.mov`, `.webm`) |
| `file` | Messages containing file URLs |

### Combining Filters

Stack multiple filters in a single query:

```
from:alice in:general has:link after:2026-01-01
```

Mix filters with free text:

```
from:alice deployment error
```

Mix filters with exact phrases:

```
in:bugs "null pointer" before:2026-04-01
```

### Filter Hints

When the search input is focused and empty, a dropdown shows all available filters. Click any filter to insert it into the input.

## Search Results

Results appear in a dropdown panel below the search bar:

- Each result shows the **author** (avatar + name), **channel** (`#channel-name`), **date/time**, and a **content preview** with search terms highlighted in green
- Results are ordered newest first
- Click **"Load more results"** at the bottom to paginate (25 results per page)
- Click any result to **jump to that message** in its channel

## Jump to Message

When you click a search result:

1. The app navigates to the result's channel
2. The message list loads
3. The target message scrolls into view and briefly highlights with a green flash (2 seconds)

This works across channels — if you're in `#general` and click a result from `#bugs`, it switches to `#bugs` and scrolls to the message.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Escape` | Close search and clear results |

## Architecture

### Query Parser (`src/lib/search.ts`)

The parser tokenizes the raw query string into a structured `SearchQuery` object:

```typescript
interface SearchQuery {
  text: string[];       // Free text terms and quoted phrases
  from?: string;        // from: filter value
  in?: string;          // in: filter value
  has?: string;         // has: filter value (link, image, video, file)
  before?: Date;        // before: date filter
  after?: Date;         // after: date filter
  mentions?: string;    // mentions: filter value
}
```

The `buildSearchWhere()` function converts a `SearchQuery` into a Prisma `where` clause with `AND` conditions. It resolves human-readable names to database IDs:

- `from:alice` → looks up "alice" in the server's member list → filters by `authorPubkey`
- `in:general` → looks up "general" in the server's channel list → filters by `channelId`

Name matching is **case-insensitive** and supports **partial matches** (e.g., `from:ali` matches "Alice").

### API Route (`GET /api/search`)

**Parameters:**

| Param | Required | Description |
|-------|----------|-------------|
| `q` | Yes | Search query string |
| `serverId` | Yes | Server to search within |
| `cursor` | No | Pagination cursor (message ID) |
| `limit` | No | Results per page (default 25, max 50) |

**Auth:** Requires a valid session cookie. User must be a member of the target server.

**Response:**

```json
{
  "results": [
    {
      "id": "msg-id",
      "channelId": "ch-id",
      "channelName": "general",
      "authorPubkey": "abc123...",
      "content": "hello world",
      "createdAt": "2026-04-09T12:00:00.000Z",
      "editedAt": null,
      "replyTo": null,
      "reactions": []
    }
  ],
  "nextCursor": "msg-id-25" // null if no more results
}
```

**How it works:**

1. Validates auth and server membership
2. Loads all members and channels for the server (for name → ID resolution)
3. Parses the query string with `parseSearchQuery()`
4. Builds Prisma where clause with `buildSearchWhere()`
5. Queries messages with cursor-based pagination
6. Attaches channel names to each result

### Client State (`src/store/search.ts`)

Zustand store managing:

- `query` — current search input text
- `results` — array of `SearchResult` objects
- `isSearching` — loading state
- `isOpen` — whether the search bar is expanded
- `cursor` / `hasMore` — pagination state

### UI Component (`src/components/chat/SearchBar.tsx`)

- **Collapsed state:** Magnifying glass icon button
- **Expanded state:** Input field with search icon, spinner, and close button
- **Debounced search:** 300ms delay after typing stops before firing API request
- **Filter hints:** Dropdown with clickable filter prefixes when input is empty
- **Results panel:** Scrollable dropdown with result cards
- **Text highlighting:** Search terms are highlighted in green within result previews

### Jump-to-Message (`src/components/chat/MessageArea.tsx`)

When a search result is clicked:

1. `SearchBar.handleJump()` sets `activeChannelId` and `highlightedMessageId` in the chat store
2. `MessageArea` detects `highlightedMessageId` change via `useEffect`
3. Scrolls the target message into view with `scrollIntoView({ behavior: 'smooth', block: 'center' })`
4. Applies a green background highlight that fades after 2 seconds
5. Clears `highlightedMessageId` after the animation

## Limitations

- **Text matching uses `contains`** (SQL `LIKE '%term%'`), not full-text search. This is case-sensitive on PostgreSQL by default. For case-insensitive search at scale, consider adding PostgreSQL `tsvector` indexes or switching to a dedicated search engine.
- **`has:` filters use heuristics** — they check for file extension strings in message content, not actual attachment metadata. A message saying "I like .jpg files" would match `has:image`.
- **`from:` resolves the first partial match** — if multiple members match the search term, only the first one found is used.
- **No boolean operators** — AND is implicit between terms, but OR and NOT are not supported.
- **No regex support** — use exact phrases for precise matching.
- **Forum post titles** are not searched separately — only message `content` is searched. Forum post titles are stored in the `title` field, which could be added as an additional search target.

## Future Improvements

- **PostgreSQL full-text search** — add `tsvector` column and GIN index for faster, case-insensitive, stemmed search
- **Keyboard navigation** — arrow keys to navigate results, Enter to jump
- **Search history** — remember recent searches
- **Result count** — show total matches
- **Boolean operators** — support `OR` and `-term` (NOT) syntax
- **Forum title search** — include `title` field in search scope
- **Saved searches / pinned filters** — frequently used filter combinations
