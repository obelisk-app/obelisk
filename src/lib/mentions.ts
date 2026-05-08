import { nip19 } from 'nostr-tools';

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

// Mention format in message content. Supports:
//  - nostr:npub1<64 hex> (legacy internal format used by serializeMention)
//  - nostr:npub1<bech32>  (real NIP-19 encoded, e.g. pasted from clients)
//  - npub1<bech32>        (raw bech32 without scheme)
// The hex variant is tried first so we don't decode unnecessarily.
const MENTION_REGEX = /(?:nostr:)?npub1([a-z0-9]{58,90})/gi;

/**
 * Build a short, user-friendly fallback label when we don't know the member.
 * Shows the first few characters of the npub, so the user still sees "npub1abcd…"
 * instead of the full pubkey string.
 */
export function shortNpub(pubkeyHex: string): string {
  try {
    const npub = nip19.npubEncode(pubkeyHex);
    // npub1 + 6 chars of data is enough to disambiguate visually.
    return `${npub.slice(0, 11)}…`;
  } catch {
    return `${pubkeyHex.slice(0, 8)}…`;
  }
}

/**
 * Serialize a pubkey into a mention token for storage in message content.
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
  let lastIndex = 0;

  // Reset regex state
  MENTION_REGEX.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = MENTION_REGEX.exec(content)) !== null) {
    const raw = match[0];
    const body = match[1]; // everything after "npub1"

    // Resolve to hex pubkey. Legacy internal format stores 64 hex chars
    // directly after "npub1"; real NIP-19 npubs are bech32 and need decoding.
    let pubkey: string | null = null;
    if (/^[a-f0-9]{64}$/i.test(body)) {
      pubkey = body.toLowerCase();
    } else {
      try {
        const decoded = nip19.decode(`npub1${body}`);
        if (decoded.type === 'npub') pubkey = decoded.data as string;
      } catch {
        // Not a valid npub — treat as plain text.
      }
    }

    if (!pubkey) continue;

    // Add text before match
    if (match.index > lastIndex) {
      segments.push({ type: 'text', text: content.slice(lastIndex, match.index) });
    }

    const member = memberMap.get(pubkey);
    segments.push({
      type: 'mention',
      pubkey,
      displayName: member?.displayName || shortNpub(pubkey),
    });

    lastIndex = match.index + raw.length;
  }

  // Add remaining text
  if (lastIndex < content.length) {
    segments.push({ type: 'text', text: content.slice(lastIndex) });
  }

  // If no mentions found, return single text segment
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
 * Extract the unique set of mentioned pubkeys (hex) from a message content
 * string. Handles both the legacy hex form (`nostr:npub1<64 hex>`) and real
 * bech32-encoded NIP-19 npubs (`nostr:npub1<bech32>` / raw `npub1<bech32>`).
 *
 * Exported for use in `server.ts` so that the server-side notification
 * pipeline stays in sync with the client-side parser in `parseMentions` —
 * previously the server used a hex-only regex and silently dropped bech32
 * mentions.
 */
export function extractMentionPubkeys(content: string): string[] {
  const found = new Set<string>();
  // Rebuild regex each call to avoid shared `lastIndex` state across callers.
  const re = /(?:nostr:)?npub1([a-z0-9]{58,90})/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    const body = match[1];
    if (/^[a-f0-9]{64}$/i.test(body)) {
      found.add(body.toLowerCase());
      continue;
    }
    try {
      const decoded = nip19.decode(`npub1${body}`);
      if (decoded.type === 'npub') found.add(decoded.data as string);
    } catch {
      // Not a valid npub — ignore.
    }
  }
  return [...found];
}

/**
 * Extract the unique set of mentioned pubkeys (hex) for a full message —
 * combines `extractMentionPubkeys(content)` with any `["p", <hex>]` tags.
 *
 * NIP-29 group messages routinely carry `#p` tags for their mention targets
 * (some clients tag without inlining a token in content; others do both).
 * Using only the content regex misses the tag-only case, so the read-state
 * "channel has mention" selector and the inbox push at ingest both feed
 * through this helper.
 *
 * Hex tag values are lowercased; values that aren't 64-char hex are
 * silently dropped.
 */
export function extractMentionPubkeysFromMessage(
  content: string,
  tags: ReadonlyArray<ReadonlyArray<string>>,
): string[] {
  const found = new Set<string>(extractMentionPubkeys(content));
  for (const t of tags) {
    if (t[0] === 'p' && typeof t[1] === 'string' && /^[a-f0-9]{64}$/i.test(t[1])) {
      found.add(t[1].toLowerCase());
    }
  }
  return [...found];
}

/**
 * Transform canonical message content (containing `nostr:npub1<hex>` or
 * bech32 mention tokens) into a human-friendly form suitable for a textarea:
 * each mention becomes `@DisplayName` (or `@npub1abc…` for unknown members).
 *
 * Collisions are disambiguated with a `#N` suffix, starting at `#2`. The
 * caller gets back a `Map<displayToken, canonicalToken>` that must be passed
 * to `displayTokensToContent` on submit to reconstruct the canonical form.
 *
 * All returned canonical tokens are normalized to the legacy hex form
 * (`nostr:npub1<64hex>`) via `serializeMention`, so the rest of the pipeline
 * (server `extractMentionPubkeys`, client `parseMentions`) stays consistent
 * regardless of whether the input used hex or bech32.
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
  const regex = /(?:nostr:)?npub1([a-z0-9]{58,90})/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const raw = match[0];
    const body = match[1];

    let pubkey: string | null = null;
    if (/^[a-f0-9]{64}$/i.test(body)) {
      pubkey = body.toLowerCase();
    } else {
      try {
        const decoded = nip19.decode(`npub1${body}`);
        if (decoded.type === 'npub') pubkey = decoded.data as string;
      } catch {
        /* not a valid npub — leave as literal text */
      }
    }
    if (!pubkey) continue;

    display += content.slice(lastIndex, match.index);

    const member = memberMap.get(pubkey);
    const baseName = member?.displayName || shortNpub(pubkey);
    const count = (nameUsage.get(baseName) || 0) + 1;
    nameUsage.set(baseName, count);
    const displayToken = count === 1 ? `@${baseName}` : `@${baseName}#${count}`;

    map.set(displayToken, serializeMention(pubkey));
    display += displayToken;

    lastIndex = match.index + raw.length;
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

/**
 * Build the deduped set of mentionable pubkeys for a relay by unioning the
 * members, admins, and creator of every supplied group. The mention
 * autocomplete uses this so `@`-mentions reach anyone on the relay, not just
 * the current channel's roster — typing `@alice` finds Alice even if she's
 * only in a sister channel.
 *
 * `groupIds` is intentionally explicit (not derived from the maps) so the
 * caller can pass the WoT-filtered visible groups from `useGroups()`. That
 * keeps spam-channel rolls out of the autocomplete when WoT is enabled.
 */
export function relayMentionCandidates(
  groupIds: ReadonlyArray<string>,
  membersByGroup: Readonly<Record<string, ReadonlyArray<string>>>,
  adminsByGroup: Readonly<Record<string, ReadonlyArray<string>>>,
  creatorsByGroup: Readonly<Record<string, string>>,
): string[] {
  const set = new Set<string>();
  for (const id of groupIds) {
    for (const pk of membersByGroup[id] ?? []) set.add(pk);
    for (const pk of adminsByGroup[id] ?? []) set.add(pk);
    const creator = creatorsByGroup[id];
    if (creator) set.add(creator);
  }
  return Array.from(set);
}

/**
 * Detect an in-progress `@`-mention query at the cursor. Returns the partial
 * username typed after the most recent `@` (possibly empty), or `null` when
 * the cursor is not currently sitting in a mention slot.
 *
 * Matches `@` at start-of-input or after whitespace so emails/handles inside
 * words don't trigger the popup. Word characters only — once the user types
 * anything else, the slot closes.
 */
export function detectMentionQuery(value: string, cursor: number): string | null {
  const before = value.slice(0, cursor);
  const m = before.match(/(?:^|\s)@(\w*)$/);
  return m ? m[1] : null;
}

/**
 * Replace the in-progress `@query` slot at `cursor` with a `nostr:npub…`
 * mention token (NIP-19 bech32 form, trailing space) for `pubkey`. If no
 * slot is open, the token is inserted at the cursor with a leading space
 * when needed. Returns the new draft text and the cursor position
 * immediately after the inserted token.
 */
export function applyMentionToDraft(
  draft: string,
  cursor: number,
  pubkey: string,
): { next: string; cursor: number } {
  const before = draft.slice(0, cursor);
  const after = draft.slice(cursor);
  const token = `nostr:${nip19.npubEncode(pubkey)} `;
  let replaced: string;
  if (/@(\w*)$/.test(before)) {
    replaced = before.replace(/@(\w*)$/, () => token);
  } else {
    const sep = before.length > 0 && !/\s$/.test(before) ? ' ' : '';
    replaced = before + sep + token;
  }
  return { next: replaced + after, cursor: replaced.length };
}
