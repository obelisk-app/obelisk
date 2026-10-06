'use client';

/**
 * What goes inside a DM bubble. Deliberately smaller than `MessageContent`:
 *
 * - A kind-15 file renders through `EncryptedDmAttachment` (fetch, verify,
 *   decrypt in memory).
 * - A sticker renders as the sticker, a bare image / GIF URL as the image, and
 *   `:shortcode:` as the emoji: the same things the channel composer can send.
 * - No link unfurls. `MessageContent` asks our own `/api/link-preview` to fetch
 *   every link it shows, which is fine for a channel and wrong for a private
 *   conversation: it would hand the server the URLs people send each other.
 * - Text keeps the bubble's own colour. `MessageContent` hard-codes
 *   `text-lc-white` on bold, headings and lists, which is unreadable on the
 *   green outgoing bubble.
 * - Incoming media does not load until the reader asks. Every image, sticker,
 *   custom emoji and encrypted attachment is a URL the sender chose, and
 *   fetching it hands the sender this reader's IP address and the moment they
 *   read the message. The DM default is `ask` for everyone
 *   (`src/services/remote-media.ts`); outgoing messages always render, since the
 *   reader picked those URLs themselves.
 */

import RemoteImage from '@/components/ui/RemoteImage';
import { EncryptedDmAttachment } from '@/components/chat/EncryptedDmAttachment';
import { RemoteMediaPlaceholder } from '@/components/chat/RemoteMediaPlaceholder';
import { dmFileCategory } from '@/utils/attachments/dm-file';
import { useRemoteMediaGate } from '@/services/remote-media-gate';
import type { JsDirectMessage } from '@/services/nostr-bridge';
import { TextWithEmoji } from './dm-message/TextWithEmoji';
import { useDmEmojis } from '@/hooks/chat/dm-message/useDmEmojis';
import { splitDmImages } from './dm-message/dm-message-utils';

export function DmMessageBody({ message }: { message: JsDirectMessage }) {
  const media = useRemoteMediaGate('dm', message.counterparty, message.outgoing);
  const emojis = useDmEmojis(message.customEmojis, media.show);
  const onAccent = message.outgoing;
  const linkClass = onAccent ? 'underline' : 'text-sky-400 hover:underline';

  if (message.file) {
    // A media attachment is fetched on mount; a plain file waits for a
    // click already, so only the former needs the gate.
    const fetchesOnMount = dmFileCategory(message.file.mimeType) !== 'file';
    if (fetchesOnMount && !media.show) return <RemoteMediaPlaceholder onReveal={media.reveal} />;
    return <EncryptedDmAttachment file={message.file} onAccent={onAccent} />;
  }
  if (message.sticker) {
    if (!media.show) return <RemoteMediaPlaceholder onReveal={media.reveal} />;
    return (
      <RemoteImage src={message.sticker.url} alt={`:${message.sticker.name}:`} className="h-36 w-36 object-contain" data-testid="dm-sticker" />
    );
  }
  const { images, text } = splitDmImages(message.content);
  return (
    <>
      {text && (
        <div className="whitespace-pre-wrap break-words">
          <TextWithEmoji text={text} emojis={emojis} linkClass={linkClass} />
        </div>
      )}
      {images.length > 0 && !media.show && (
        <div className={text ? 'mt-1.5' : ''}>
          <RemoteMediaPlaceholder onReveal={media.reveal} />
        </div>
      )}
      {images.length > 0 && media.show && (
        <div className={'flex flex-wrap gap-1' + (text ? ' mt-1.5' : '')} data-testid="dm-images">
          {images.map((url) => (
            <a key={url} href={url} target="_blank" rel="noopener noreferrer nofollow">
              <RemoteImage src={url} alt="" className="max-h-60 max-w-full rounded-lg object-contain" />
            </a>
          ))}
        </div>
      )}
    </>
  );
}
