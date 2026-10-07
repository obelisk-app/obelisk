import { replaceShortcodes, customEmojiPlaceholderRegex } from '@/utils/message-text/emoji-shortcodes';

/** One piece of a name or bio: text, or a custom emoji to draw as an image. */
export type EmojiTextSegment =
  | { kind: 'text'; key: string; text: string }
  | { kind: 'emoji'; key: string; name: string; url: string };

/**
 * A name or bio with `:shortcode:` custom emoji read out as image segments.
 * Uses its own `customEmojiPlaceholderRegex()` matcher: a shared global regex
 * leaked `lastIndex` between components and printed placeholders as text. A
 * placeholder whose emoji is unknown is dropped.
 */
export function emojiTextSegments(text: string, serverEmojis: Record<string, string>): EmojiTextSegment[] {
  if (!text) return [];
  const resolved = replaceShortcodes(text, serverEmojis);
  const out: EmojiTextSegment[] = [];
  let lastIndex = 0;
  let i = 0;
  const re = customEmojiPlaceholderRegex();
  let match: RegExpExecArray | null;
  while ((match = re.exec(resolved)) !== null) {
    if (match.index > lastIndex) out.push({ kind: 'text', key: `t${i}`, text: resolved.slice(lastIndex, match.index) });
    const name = match[1];
    const url = serverEmojis[name];
    if (url) out.push({ kind: 'emoji', key: `e${i}`, name, url });
    lastIndex = match.index + match[0].length;
    i++;
  }
  if (lastIndex < resolved.length) out.push({ kind: 'text', key: `t${i}`, text: resolved.slice(lastIndex) });
  return out;
}
