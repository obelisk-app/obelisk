import { customEmojiPlaceholderRegex, replaceShortcodes } from '@/utils/message-text/emoji-shortcodes';

/** One piece of DM text as it is drawn: plain text, a link, or a custom emoji image. */
export type DmTextSegment =
  | { kind: 'text'; key: string; text: string }
  | { kind: 'link'; key: string; url: string }
  | { kind: 'emoji'; key: string; url: string; name: string };

const URL_SPLIT = /(https?:\/\/[^\s<>)"'\]]+)/g;

/**
 * DM text cut into what `TextWithEmoji` draws: links, custom emoji (from
 * `:shortcode:` against `emojis`) and the text between them. Each chunk gets
 * its own `customEmojiPlaceholderRegex()`: a shared global matcher once leaked
 * its `lastIndex` here and printed placeholders as text. A placeholder whose
 * emoji is unknown comes back as `:name:` text.
 */
export function dmTextSegments(text: string, emojis: Record<string, string>): DmTextSegment[] {
  const out: DmTextSegment[] = [];
  replaceShortcodes(text, emojis).split(URL_SPLIT).forEach((chunk, i) => {
    if (i % 2 === 1) {
      out.push({ kind: 'link', key: `u${i}`, url: chunk });
      return;
    }
    let last = 0;
    for (const m of chunk.matchAll(customEmojiPlaceholderRegex())) {
      const at = m.index ?? 0;
      if (at > last) out.push({ kind: 'text', key: `t${i}-${last}`, text: chunk.slice(last, at) });
      const url = emojis[m[1]];
      out.push(url
        ? { kind: 'emoji', key: `e${i}-${at}`, url, name: m[1] }
        : { kind: 'text', key: `e${i}-${at}`, text: `:${m[1]}:` });
      last = at + m[0].length;
    }
    if (last < chunk.length) out.push({ kind: 'text', key: `t${i}-${last}`, text: chunk.slice(last) });
  });
  return out;
}
