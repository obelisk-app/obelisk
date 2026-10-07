import type { MentionData } from '@/utils/message-text/markdown';
import { MENTION_PLACEHOLDER_REGEX, EVERYONE_PLACEHOLDER } from '@/constants/message-text/markdown';
import { customEmojiPlaceholderRegex } from '@/utils/message-text/emoji-shortcodes';

export type MentionMap = Map<string, MentionData>;

/** One piece of message text once its placeholders are read. */
export type PlaceholderSegment =
  | { kind: 'text'; key: string; text: string }
  | { kind: 'everyone'; key: string }
  | { kind: 'mention'; key: string; pubkey: string; displayName: string }
  | { kind: 'emoji'; key: string; name: string; url: string };

/** True when a string holds a mention, custom-emoji or @everyone placeholder. */
export function hasPlaceholder(s: string): boolean {
  return s.includes('〈MENTION:') || s.includes('〈EMOJI:') || s.includes(EVERYONE_PLACEHOLDER);
}

/**
 * Read mention + custom-emoji placeholders out of a text string. Both kinds
 * coexist in the same string, so a single scanning pass picks whichever
 * token appears next at each step. A mention whose data is missing is
 * dropped; an emoji the server no longer has falls back to its raw `:name:`;
 * a lone `〈` stays as text.
 */
export function placeholderSegments(
  text: string,
  mentions: MentionMap,
  serverEmojis: Record<string, string>,
): PlaceholderSegment[] {
  const parts: PlaceholderSegment[] = [];
  const pushText = (value: string) => parts.push({ kind: 'text', key: `t-${parts.length}`, text: value });
  let idx = 0;
  let i = 0;
  const len = text.length;
  while (i < len) {
    // Scan for the next `〈` which is our shared placeholder prefix marker.
    const start = text.indexOf('〈', i);
    if (start === -1) {
      pushText(text.slice(i));
      break;
    }
    if (start > i) pushText(text.slice(i, start));

    // @everyone broadcast: 〈EVERYONE〉
    if (text.startsWith(EVERYONE_PLACEHOLDER, start)) {
      parts.push({ kind: 'everyone', key: `ev-${idx++}-${start}` });
      i = start + EVERYONE_PLACEHOLDER.length;
      continue;
    }

    // Mention: 〈MENTION:<key>〉
    MENTION_PLACEHOLDER_REGEX.lastIndex = start;
    const mm = MENTION_PLACEHOLDER_REGEX.exec(text);
    if (mm && mm.index === start) {
      const mentionData = mentions.get(mm[1]);
      if (mentionData) {
        parts.push({ kind: 'mention', key: `m-${idx++}-${mm[1]}`, pubkey: mentionData.pubkey, displayName: mentionData.displayName });
      }
      i = start + mm[0].length;
      continue;
    }

    // Custom emoji: 〈EMOJI:<name>〉
    // Own matcher: a shared one leaked its `lastIndex` into DmMessageBody.
    const emojiRe = customEmojiPlaceholderRegex();
    emojiRe.lastIndex = start;
    const em = emojiRe.exec(text);
    if (em && em.index === start) {
      const name = em[1];
      const url = serverEmojis[name];
      if (url) parts.push({ kind: 'emoji', key: `e-${idx++}-${name}`, name, url });
      else pushText(`:${name}:`);
      i = start + em[0].length;
      continue;
    }

    // Lone `〈` that doesn't match either placeholder: emit verbatim and
    // advance by one to avoid an infinite loop.
    pushText('〈');
    i = start + 1;
  }

  return parts.length > 0 ? parts : [{ kind: 'text', key: 't-0', text }];
}
