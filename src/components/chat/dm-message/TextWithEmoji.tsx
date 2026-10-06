'use client';

import { Fragment, type ReactNode } from 'react';
import { customEmojiPlaceholderRegex, replaceShortcodes } from '@/utils/message-text/emoji-shortcodes';
import RemoteImage from '@/components/ui/RemoteImage';

/**
 * DM text with links and custom emoji. Each chunk gets its own
 * `customEmojiPlaceholderRegex()`: a shared global matcher once leaked its
 * `lastIndex` here and printed placeholders as text.
 */
const URL_SPLIT = /(https?:\/\/[^\s<>)"'\]]+)/g;

export function TextWithEmoji({ text, emojis, linkClass }: { text: string; emojis: Record<string, string>; linkClass: string }) {
  const resolved = replaceShortcodes(text, emojis);
  const out: ReactNode[] = [];
  resolved.split(URL_SPLIT).forEach((chunk, i) => {
    if (i % 2 === 1) {
      out.push(
        <a key={`u${i}`} href={chunk} target="_blank" rel="noopener noreferrer nofollow" className={linkClass}>
          {chunk}
        </a>,
      );
      return;
    }
    let last = 0;
    for (const m of chunk.matchAll(customEmojiPlaceholderRegex())) {
      const at = m.index ?? 0;
      if (at > last) out.push(<Fragment key={`t${i}-${last}`}>{chunk.slice(last, at)}</Fragment>);
      const url = emojis[m[1]];
      out.push(url
        ? <RemoteImage key={`e${i}-${at}`} src={url} alt={`:${m[1]}:`} title={`:${m[1]}:`} className="inline-block h-5 w-5 align-text-bottom object-contain" />
        : <Fragment key={`e${i}-${at}`}>{`:${m[1]}:`}</Fragment>);
      last = at + m[0].length;
    }
    if (last < chunk.length) out.push(<Fragment key={`t${i}-${last}`}>{chunk.slice(last)}</Fragment>);
  });
  return <>{out}</>;
}
