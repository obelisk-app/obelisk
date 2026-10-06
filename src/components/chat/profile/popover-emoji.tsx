import { Fragment, type ReactNode } from 'react';
import { replaceShortcodes, customEmojiPlaceholderRegex } from '@/utils/message-text/emoji-shortcodes';
import RemoteImage from '@/components/ui/RemoteImage';

/**
 * A name or bio with `:shortcode:` custom emoji drawn as images. Uses its
 * own `customEmojiPlaceholderRegex()` matcher: a shared global regex leaked
 * `lastIndex` between components and printed placeholders as text.
 */
export function renderWithEmojis(text: string, serverEmojis: Record<string, string>): ReactNode {
  if (!text) return text;
  const resolved = replaceShortcodes(text, serverEmojis);
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let i = 0;
  const re = customEmojiPlaceholderRegex();
  let match: RegExpExecArray | null;
  while ((match = re.exec(resolved)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(<Fragment key={`t${i}`}>{resolved.slice(lastIndex, match.index)}</Fragment>);
    }
    const name = match[1];
    const url = serverEmojis[name];
    if (url) {
      nodes.push(
        <RemoteImage
          key={`e${i}`}
          src={url}
          alt={`:${name}:`}
          title={`:${name}:`}
          className="inline-block w-[1.1em] h-[1.1em] align-[-0.15em] object-contain"
        />,
      );
    }
    lastIndex = match.index + match[0].length;
    i++;
  }
  if (lastIndex < resolved.length) {
    nodes.push(<Fragment key={`t${i}`}>{resolved.slice(lastIndex)}</Fragment>);
  }
  return nodes.length ? nodes : resolved;
}
