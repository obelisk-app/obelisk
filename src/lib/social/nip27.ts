/**
 * NIP-27 / NIP-21 `nostr:` URI handling.
 *
 * The app had NO support for this: grepping `nostr:` across `markdown.ts`,
 * `mentions.ts` and `MessageContent.tsx` returned nothing. That's fine for
 * NIP-29 group chat, which uses its own `@name` mention syntax, but it makes
 * the social feed look broken — Primal, Amethyst and Damus all write mentions
 * and quotes as inline `nostr:npub1…` / `nostr:nevent1…`, and Obelisk would
 * render 60 characters of raw bech32 in the middle of a sentence.
 *
 * Parsing here is deliberately tolerant: an unknown or malformed entity is
 * left as plain text rather than throwing, because a feed must render
 * whatever arbitrary strangers published.
 */

import { nip19 } from 'nostr-tools';

/**
 * A bech32 entity, with the `nostr:` scheme optional.
 *
 * The scheme is what NIP-21 specifies and what Primal/Amethyst/Damus write,
 * but people paste bare `naddr1…` and `nevent1…` all the time, and those
 * were rendering as sixty unbroken characters of raw bech32 mid-sentence.
 *
 * A bare entity is only taken when it stands on its own — see
 * `STANDS_ALONE_BEFORE`. Without that, the `naddr1…` inside a
 * `https://zap.cooking/naddr1…` URL gets eaten and the link breaks.
 */
const NOSTR_URI_RE = /(nostr:)?((?:npub|nprofile|nevent|note|naddr)1[023456789acdefghjklmnpqrstuvwxyz]+)/gi;

/**
 * Characters that mean a bare bech32 run is part of something larger — a URL
 * path, a domain, a handle — rather than a reference in its own right.
 */
const STANDS_ALONE_BEFORE = /[\w/:.@-]/;

export type NostrRef =
  | { type: 'pubkey'; pubkey: string; relays: string[]; raw: string }
  | { type: 'event'; id: string; relays: string[]; author: string | null; raw: string }
  | { type: 'address'; identifier: string; pubkey: string; kind: number; raw: string };

export type ContentToken =
  | { kind: 'text'; value: string }
  | { kind: 'ref'; ref: NostrRef };

/** Decode one bech32 entity. Returns null for anything we can't use. */
export function decodeNostrEntity(entity: string, raw = `nostr:${entity}`): NostrRef | null {
  let decoded: nip19.DecodedResult;
  try {
    decoded = nip19.decode(entity);
  } catch {
    return null;
  }
  switch (decoded.type) {
    case 'npub':
      return { type: 'pubkey', pubkey: decoded.data, relays: [], raw };
    case 'nprofile':
      return {
        type: 'pubkey',
        pubkey: decoded.data.pubkey,
        relays: decoded.data.relays ?? [],
        raw,
      };
    case 'note':
      return { type: 'event', id: decoded.data, relays: [], author: null, raw };
    case 'nevent':
      return {
        type: 'event',
        id: decoded.data.id,
        relays: decoded.data.relays ?? [],
        author: decoded.data.author ?? null,
        raw,
      };
    case 'naddr':
      return {
        type: 'address',
        identifier: decoded.data.identifier,
        pubkey: decoded.data.pubkey,
        kind: decoded.data.kind,
        raw,
      };
    default:
      return null;
  }
}

/**
 * Split content into text runs and `nostr:` references, preserving order so
 * a renderer can rebuild the paragraph with components in place.
 */
export function tokenizeContent(content: string): ContentToken[] {
  const tokens: ContentToken[] = [];
  let lastIndex = 0;
  NOSTR_URI_RE.lastIndex = 0;
  for (const match of content.matchAll(NOSTR_URI_RE)) {
    const index = match.index ?? 0;
    // A bare entity must stand on its own; with a `nostr:` scheme in front
    // it is unambiguous wherever it appears.
    if (!match[1] && index > 0 && STANDS_ALONE_BEFORE.test(content[index - 1])) continue;
    const ref = decodeNostrEntity(match[2], match[0]);
    if (!ref) continue;
    if (index > lastIndex) tokens.push({ kind: 'text', value: content.slice(lastIndex, index) });
    tokens.push({ kind: 'ref', ref });
    lastIndex = index + match[0].length;
  }
  if (lastIndex < content.length) tokens.push({ kind: 'text', value: content.slice(lastIndex) });
  return tokens;
}

/** Every pubkey mentioned inline — used to build the `p` tag set on publish. */
export function mentionedPubkeys(content: string): string[] {
  const found = new Set<string>();
  for (const token of tokenizeContent(content)) {
    if (token.kind === 'ref' && token.ref.type === 'pubkey') found.add(token.ref.pubkey);
  }
  return [...found];
}

/** Every event referenced inline — used to build `q` tags on a quote post. */
export function referencedEvents(content: string): { id: string; author: string | null; relays: string[] }[] {
  const found = new Map<string, { id: string; author: string | null; relays: string[] }>();
  for (const token of tokenizeContent(content)) {
    if (token.kind === 'ref' && token.ref.type === 'event' && !found.has(token.ref.id)) {
      found.set(token.ref.id, {
        id: token.ref.id,
        author: token.ref.author,
        relays: token.ref.relays,
      });
    }
  }
  return [...found.values()];
}

/** Encode a pubkey as the mention form other clients expect in content. */
export function encodeMention(pubkey: string, relays: readonly string[] = []): string {
  try {
    return relays.length
      ? `nostr:${nip19.nprofileEncode({ pubkey, relays: [...relays] })}`
      : `nostr:${nip19.npubEncode(pubkey)}`;
  } catch {
    return '';
  }
}

/** Encode an event reference for a quote post. */
export function encodeEventRef(
  id: string,
  opts: { relays?: readonly string[]; author?: string | null } = {},
): string {
  try {
    return `nostr:${nip19.neventEncode({
      id,
      ...(opts.relays?.length ? { relays: [...opts.relays] } : {}),
      ...(opts.author ? { author: opts.author } : {}),
    })}`;
  } catch {
    return '';
  }
}
