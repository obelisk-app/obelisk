'use client';

/**
 * What goes inside a DM bubble. Deliberately smaller than `MessageContent`:
 *
 * - A kind-15 file renders through `EncryptedDmAttachment` (fetch, verify,
 *   decrypt in memory).
 * - A sticker renders as the sticker, a bare image / GIF URL as the image, and
 *   `:shortcode:` as the emoji — the same things the channel composer can send.
 * - No link unfurls. `MessageContent` asks our own `/api/link-preview` to fetch
 *   every link it shows, which is fine for a channel and wrong for a private
 *   conversation: it would hand the server the URLs people send each other.
 * - Text keeps the bubble's own colour. `MessageContent` hard-codes
 *   `text-lc-white` on bold, headings and lists, which is unreadable on the
 *   green outgoing bubble.
 */

import { Fragment, useMemo } from 'react';
import { EncryptedDmAttachment } from '@/components/chat/EncryptedDmAttachment';
import { extractUrls, isImageUrl } from '@/lib/markdown';
import { useChatStore } from '@/store/chat';
import { mergeCustomEmojiMaps } from '@/lib/custom-emoji-tags';
import { CUSTOM_EMOJI_PLACEHOLDER_REGEX, replaceShortcodes } from '@/lib/emoji-shortcodes';
import type { JsDirectMessage } from '@/lib/nostr-bridge/types';

const URL_SPLIT = /(https?:\/\/[^\s<>)"'\]]+)/g;

function TextWithEmoji({ text, emojis, linkClass }: { text: string; emojis: Record<string, string>; linkClass: string }) {
  const resolved = replaceShortcodes(text, emojis);
  const out: React.ReactNode[] = [];
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
    for (const m of chunk.matchAll(CUSTOM_EMOJI_PLACEHOLDER_REGEX)) {
      const at = m.index ?? 0;
      if (at > last) out.push(<Fragment key={`t${i}-${last}`}>{chunk.slice(last, at)}</Fragment>);
      const url = emojis[m[1]];
      out.push(url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img key={`e${i}-${at}`} src={url} alt={`:${m[1]}:`} title={`:${m[1]}:`} className="inline-block h-5 w-5 align-text-bottom object-contain" />
        : <Fragment key={`e${i}-${at}`}>{`:${m[1]}:`}</Fragment>);
      last = at + m[0].length;
    }
    if (last < chunk.length) out.push(<Fragment key={`t${i}-${last}`}>{chunk.slice(last)}</Fragment>);
  });
  return <>{out}</>;
}

export function DmMessageBody({ message }: { message: JsDirectMessage }) {
  const serverEmojis = useChatStore((s) => s.serverEmojis);
  const emojis = useMemo(
    () => mergeCustomEmojiMaps(serverEmojis, message.customEmojis ?? {}),
    [serverEmojis, message.customEmojis],
  );
  const onAccent = message.outgoing;
  const linkClass = onAccent ? 'underline' : 'text-sky-400 hover:underline';

  if (message.file) {
    return <EncryptedDmAttachment file={message.file} onAccent={onAccent} />;
  }
  if (message.sticker) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={message.sticker.url} alt={`:${message.sticker.name}:`} className="h-36 w-36 object-contain" data-testid="dm-sticker" />
    );
  }
  const images = extractUrls(message.content).filter(isImageUrl).slice(0, 4);
  let text = message.content;
  for (const url of images) text = text.split(url).join('');
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  return (
    <>
      {text && (
        <div className="whitespace-pre-wrap break-words">
          <TextWithEmoji text={text} emojis={emojis} linkClass={linkClass} />
        </div>
      )}
      {images.length > 0 && (
        <div className={'flex flex-wrap gap-1' + (text ? ' mt-1.5' : '')} data-testid="dm-images">
          {images.map((url) => (
            <a key={url} href={url} target="_blank" rel="noopener noreferrer nofollow">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" loading="lazy" className="max-h-60 max-w-full rounded-lg object-contain" />
            </a>
          ))}
        </div>
      )}
    </>
  );
}
