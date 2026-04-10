import { nip19 } from 'nostr-tools';

export interface MemberInfo {
  pubkey: string;
  displayName: string;
  picture?: string;
}

export type MentionSegment =
  | { type: 'text'; text: string }
  | { type: 'mention'; pubkey: string; displayName: string };

// Mention format in message content. Supports:
//  - nostr:npub1<64 hex> (legacy internal format used by serializeMention)
//  - nostr:npub1<bech32>  (real NIP-19 encoded, e.g. pasted from clients)
//  - npub1<bech32>        (raw bech32 without scheme)
// The hex variant is tried first so we don't decode unnecessarily.
const MENTION_REGEX = /(?:nostr:)?npub1([a-z0-9]{58,})/gi;

/**
 * Build a short, user-friendly fallback label when we don't know the member.
 * Shows the first few characters of the npub, so the user still sees "npub1abcd…"
 * instead of the full pubkey string.
 */
function shortNpub(pubkeyHex: string): string {
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
