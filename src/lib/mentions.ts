import {
  shortNpub,
  extractMentionPubkeys,
  findNpubMentions,
} from '@nostr-wot/data';

// Re-export so existing call sites keep working.
export { shortNpub, extractMentionPubkeys };

export interface MemberCustomRoleInfo {
  id: string;
  name: string;
  color: string;
  icon?: string | null;
  priority: number;
}

export interface MemberInfo {
  pubkey: string;
  displayName: string;
  picture?: string;
  role?: string; // base role: owner | admin | mod | member
  customRoles?: MemberCustomRoleInfo[];
  banner?: string;
  nip05?: string;
  about?: string;
  website?: string;
  lud16?: string;
  joinedAt?: string;
  // Prebuilt server bots surface as pseudo-members with these two fields.
  // Regular Nostr members always have isBot=false/undefined.
  isBot?: boolean;
  botType?: string;
  statusText?: string | null;
}

export type MentionSegment =
  | { type: 'text'; text: string }
  | { type: 'mention'; pubkey: string; displayName: string };

/**
 * Serialize a pubkey into a mention token for storage in message content.
 * Uses the legacy `nostr:npub1<64hex>` form (NOT bech32) so server-side
 * notification fan-out and existing stored messages stay compatible.
 */
export function serializeMention(pubkey: string): string {
  return `nostr:npub1${pubkey}`;
}

/**
 * Parse message content into segments of text and mentions.
 */
export function parseMentions(content: string, members: MemberInfo[]): MentionSegment[] {
  const memberMap = new Map(members.map(m => [m.pubkey, m]));
  const segments: MentionSegment[] = [];
  const matches = findNpubMentions(content);
  let lastIndex = 0;

  for (const m of matches) {
    if (m.start > lastIndex) {
      segments.push({ type: 'text', text: content.slice(lastIndex, m.start) });
    }
    const member = memberMap.get(m.pubkey);
    segments.push({
      type: 'mention',
      pubkey: m.pubkey,
      displayName: member?.displayName || shortNpub(m.pubkey),
    });
    lastIndex = m.end;
  }

  if (lastIndex < content.length) {
    segments.push({ type: 'text', text: content.slice(lastIndex) });
  }

  if (segments.length === 0) {
    segments.push({ type: 'text', text: content });
  }

  return segments;
}

// Matches the literal `@everyone` when it isn't embedded inside another
// word or email-like token. Used by parser + renderer + server fan-out.
const EVERYONE_REGEX = /(?<![\w@])@everyone(?![\w.])/;
const EVERYONE_REGEX_GLOBAL = /(?<![\w@])@everyone(?![\w.])/g;

export { EVERYONE_REGEX_GLOBAL };

/**
 * Does this message contain an `@everyone` broadcast token?
 *
 * Returns true only when the token stands on its own — not inside words
 * (`@everyones`), identifiers (`foo@everyone`), or domain-like strings
 * (`@everyone.com`). The server uses this to decide whether to fan out
 * notifications to all members; gated on the author's role separately.
 */
export function hasEveryoneMention(content: string): boolean {
  return EVERYONE_REGEX.test(content);
}

/**
 * Transform canonical message content (containing `nostr:npub1<hex>` or
 * bech32 mention tokens) into a human-friendly form suitable for a textarea:
 * each mention becomes `@DisplayName` (or `@npub1abc…` for unknown members).
 *
 * Collisions are disambiguated with a `#N` suffix, starting at `#2`. The
 * caller gets back a `Map<displayToken, canonicalToken>` that must be passed
 * to `displayTokensToContent` on submit to reconstruct the canonical form.
 */
export function contentToDisplayTokens(
  content: string,
  members: MemberInfo[],
): { display: string; map: Map<string, string> } {
  const memberMap = new Map(members.map((m) => [m.pubkey, m]));
  const nameUsage = new Map<string, number>();
  const map = new Map<string, string>();

  let display = '';
  let lastIndex = 0;
  for (const m of findNpubMentions(content)) {
    display += content.slice(lastIndex, m.start);

    const member = memberMap.get(m.pubkey);
    const baseName = member?.displayName || shortNpub(m.pubkey);
    const count = (nameUsage.get(baseName) || 0) + 1;
    nameUsage.set(baseName, count);
    const displayToken = count === 1 ? `@${baseName}` : `@${baseName}#${count}`;

    map.set(displayToken, serializeMention(m.pubkey));
    display += displayToken;

    lastIndex = m.end;
  }

  display += content.slice(lastIndex);
  return { display, map };
}

/**
 * Reverse of `contentToDisplayTokens`: replace each `@DisplayName` token from
 * the map with the canonical `nostr:npub1<hex>` form so the payload the server
 * receives matches the historical format.
 *
 * Longer tokens are replaced first so that `@Alice#2` is not clobbered by an
 * earlier `@Alice` replacement.
 */
export function displayTokensToContent(
  display: string,
  map: Map<string, string>,
): string {
  if (map.size === 0) return display;
  const tokens = [...map.keys()].sort((a, b) => b.length - a.length);
  let result = display;
  for (const token of tokens) {
    const raw = map.get(token)!;
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(escaped, 'g'), raw);
  }
  return result;
}

/**
 * Filter members by query string (matches displayName or pubkey prefix).
 */
export function filterMembers(members: MemberInfo[], query: string): MemberInfo[] {
  const q = query.toLowerCase();
  return members.filter(m =>
    m.displayName.toLowerCase().includes(q) ||
    m.pubkey.toLowerCase().startsWith(q)
  );
}
