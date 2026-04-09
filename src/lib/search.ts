export interface SearchQuery {
  text: string[];
  from?: string;
  in?: string;
  has?: string;
  before?: Date;
  after?: Date;
  mentions?: string;
}

/**
 * Parse a Discord-style search query string into structured filters.
 * Supports: from:name, in:channel, has:link/image/file, before:YYYY-MM-DD,
 * after:YYYY-MM-DD, mentions:name, and "exact phrases".
 */
export function parseSearchQuery(raw: string): SearchQuery {
  const query: SearchQuery = { text: [] };
  if (!raw || !raw.trim()) return query;

  // Match quoted phrases and filter:value tokens, and bare words
  const tokenRegex = /"([^"]+)"|(\S+)/g;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(raw)) !== null) {
    const quoted = match[1];
    const token = match[2];

    if (quoted) {
      // Quoted phrase → exact text search
      query.text.push(quoted);
      continue;
    }

    if (!token) continue;

    const filterMatch = token.match(/^(from|in|has|before|after|mentions):(.+)$/i);
    if (filterMatch) {
      const key = filterMatch[1].toLowerCase();
      const value = filterMatch[2];

      switch (key) {
        case 'from':
          query.from = value;
          break;
        case 'in':
          query.in = value;
          break;
        case 'has':
          query.has = value.toLowerCase();
          break;
        case 'before': {
          const d = new Date(value);
          if (!isNaN(d.getTime())) query.before = d;
          break;
        }
        case 'after': {
          const d = new Date(value);
          if (!isNaN(d.getTime())) query.after = d;
          break;
        }
        case 'mentions':
          query.mentions = value;
          break;
      }
    } else {
      query.text.push(token);
    }
  }

  return query;
}

/** Content patterns for `has:` filter */
const HAS_PATTERNS: Record<string, RegExp> = {
  link: /https?:\/\//,
  image: /\.(jpg|jpeg|png|gif|webp)(\?|$)/i,
  file: /\.(pdf|zip|tar|gz|doc|docx|xls|xlsx|csv|txt|mp3|mp4|mov|avi)(\?|$)/i,
  video: /\.(mp4|mov|avi|webm|mkv)(\?|$)/i,
};

/**
 * Build a Prisma `where` clause from a parsed SearchQuery.
 * `serverId` scopes results to the server. `channelIds` optionally limits to accessible channels.
 */
export function buildSearchWhere(
  query: SearchQuery,
  serverId: string,
  memberLookup?: Map<string, string>, // displayName -> pubkey
  channelLookup?: Map<string, string>, // channelName -> channelId
): Record<string, unknown> {
  const conditions: Record<string, unknown>[] = [];

  // Always exclude deleted messages
  conditions.push({ deletedAt: null });

  // Scope to server via channel relation
  conditions.push({ channel: { serverId } });

  // from: filter — resolve displayName to pubkey via memberLookup
  if (query.from && memberLookup) {
    const searchName = query.from.toLowerCase();
    let pubkey: string | undefined;
    for (const [name, pk] of memberLookup) {
      if (name.toLowerCase().includes(searchName)) {
        pubkey = pk;
        break;
      }
    }
    if (pubkey) {
      conditions.push({ authorPubkey: pubkey });
    } else {
      // If from: doesn't match anyone, return no results
      conditions.push({ authorPubkey: '__no_match__' });
    }
  }

  // in: filter — resolve channel name to id
  if (query.in && channelLookup) {
    const searchChannel = query.in.toLowerCase();
    let channelId: string | undefined;
    for (const [name, id] of channelLookup) {
      if (name.toLowerCase().includes(searchChannel)) {
        channelId = id;
        break;
      }
    }
    if (channelId) {
      conditions.push({ channelId });
    } else {
      conditions.push({ channelId: '__no_match__' });
    }
  }

  // before: / after:
  if (query.before) {
    conditions.push({ createdAt: { lt: query.before } });
  }
  if (query.after) {
    conditions.push({ createdAt: { gt: query.after } });
  }

  // mentions: filter — search content for @displayName or pubkey prefix
  if (query.mentions) {
    conditions.push({ content: { contains: query.mentions } });
  }

  // Free text — each term must appear in content (case-insensitive via contains)
  for (const term of query.text) {
    conditions.push({ content: { contains: term } });
  }

  // has: filter — we can't use regex in SQLite/Prisma, so use contains heuristic
  if (query.has) {
    switch (query.has) {
      case 'link':
        conditions.push({ content: { contains: 'http' } });
        break;
      case 'image':
        // Heuristic: contains common image extensions
        conditions.push({
          OR: [
            { content: { contains: '.jpg' } },
            { content: { contains: '.jpeg' } },
            { content: { contains: '.png' } },
            { content: { contains: '.gif' } },
            { content: { contains: '.webp' } },
          ],
        });
        break;
      case 'video':
        conditions.push({
          OR: [
            { content: { contains: '.mp4' } },
            { content: { contains: '.mov' } },
            { content: { contains: '.webm' } },
          ],
        });
        break;
      case 'file':
        conditions.push({ content: { contains: 'http' } });
        break;
    }
  }

  return { AND: conditions };
}
