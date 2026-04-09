export interface MemberInfo {
  pubkey: string;
  displayName: string;
  picture?: string;
}

export type MentionSegment =
  | { type: 'text'; text: string }
  | { type: 'mention'; pubkey: string; displayName: string };

// Mention format in message content: nostr:npub1<pubkey_hex>
const MENTION_REGEX = /nostr:npub1([a-f0-9]{64})/g;

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
    // Add text before match
    if (match.index > lastIndex) {
      segments.push({ type: 'text', text: content.slice(lastIndex, match.index) });
    }

    const pubkey = match[1];
    const member = memberMap.get(pubkey);
    segments.push({
      type: 'mention',
      pubkey,
      displayName: member?.displayName || pubkey.slice(0, 8) + '...',
    });

    lastIndex = match.index + match[0].length;
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
