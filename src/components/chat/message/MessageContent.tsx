'use client';

/**
 * One message body: markdown text with mentions and custom emoji, plus the
 * media, links, invoices and game cards hoisted out of it.
 *
 * The markdown itself renders in `./message/MarkdownBody`, loaded on demand
 * (`useMarkdownBody`) so react-markdown is not in the chat's first download.
 * Its two security rules (no `rehype-raw`, no `urlTransform` override) live
 * there. Until it loads, the text shows as plain text, which React escapes.
 * The other pieces sit in `./message/`.
 */
import type { CustomEmojiMap } from '@/utils/media/tags/custom-emoji-tags';
import type { MessageSticker } from '@/utils/media/tags/sticker-tags';
import type { MessageVoiceNote } from '@/utils/media/tags/voice-note-tags';
import { ChatYouTubeEmbed } from './ChatYouTubeEmbed';
import LinkPreview from './LinkPreview';
import { RemoteMediaPlaceholder } from './RemoteMediaPlaceholder';
import ImageGallery from '../gallery/ImageGallery';
import InvoiceCard from '../zaps/InvoiceCard';
import GameCard from '../../games/card/GameCard';
import { VoiceMessage } from './VoiceMessage';
import { VideoMedia } from './VideoMedia';
import { StickerImg } from './StickerImg';
import { WelcomeBanner } from './WelcomeBanner';
import { useMessageContent } from '@/hooks/chat/message/useMessageContent';

export default function MessageContent({
  content,
  messageId,
  channelId,
  customEmojis,
  sticker,
  voiceNote,
  voiceAuthorPicture,
  voiceTimestamp,
  wideMedia = false,
  authorPubkey,
}: {
  content: string;
  messageId?: string;
  channelId?: string;
  customEmojis?: CustomEmojiMap;
  sticker?: MessageSticker;
  voiceNote?: MessageVoiceNote;
  voiceAuthorPicture?: string | null;
  voiceTimestamp?: number;
  wideMedia?: boolean;
  /**
   * Who wrote the message. Passing it (even as `null`, "unknown") turns on
   * the remote-media gate: images, stickers, sender-tagged emoji and link
   * preview images from authors outside the reader's contacts render as a
   * click-to-load placeholder, and video / audio fetch nothing until played.
   * See `src/services/media/remote-media.ts` for the policy and its defaults. Omitting
   * it keeps the legacy behaviour (everything loads), which is right only
   * for content the reader wrote themselves, such as a composer preview.
   */
  authorPubkey?: string | null;
}) {
  const {
    imageUrls, videoUrls, audioUrls, youtube, linkUrls,
    welcomeBanner, invoices, gameIds, text, media, components, renderMarkdown,
  } = useMessageContent({ content, channelId, customEmojis, sticker, voiceNote, authorPubkey });

  // Link-preview cards ARE rendered, via <LinkPreview> below: fetching
  // OpenGraph needs a server to make the outbound request, and
  // `src/app/api/link-preview` is back for exactly that (see "Unfurl links in
  // messages, including x.com"). The unfurl is same-origin: the URL goes to
  // our own route, not to a third-party OG service, which is the part that
  // mattered next to the DM-metadata work.
  //
  // A link with no OG tags simply gets no card (`LinkPreview` renders null),
  // so the anchor itself still has to be readable on its own. That is what
  // `autolinkLabel` is for: a bare `naddr1…` share URL used to print as five
  // lines of unbroken characters.

  return (
    <span data-testid="message-content">
      {sticker && media.show && <StickerImg sticker={sticker} />}
      {voiceNote && <VoiceMessage note={voiceNote} authorPicture={voiceAuthorPicture} timestamp={voiceTimestamp} autoLoad={media.show} />}
      {text && (renderMarkdown
        ? renderMarkdown(text, components)
        : <span data-testid="message-text-loading">{text}</span>)}
      {/* Welcome bot banner: hoisted so it renders with animated stars
          instead of as a generic markdown <img>. */}
      {welcomeBanner && (
        <WelcomeBanner src={welcomeBanner.src} alt={welcomeBanner.alt} />
      )}
      {/* Sender-chosen images and stickers wait behind one placeholder while
          the remote-media gate is closed; a tap reveals this message's media. */}
      {!media.show && (imageUrls.length > 0 || sticker) && (
        <RemoteMediaPlaceholder onReveal={media.reveal} />
      )}
      {/* Image matrix hoisted out of the body text */}
      {imageUrls.length > 0 && media.show && <ImageGallery urls={imageUrls} wide={wideMedia} />}
      {/* YouTube embeds hoisted so they render outside the markdown <p>
          (the player swaps in a <div> on click, which is invalid inside <p>) */}
      {youtube.map((y) => <ChatYouTubeEmbed key={y.url} videoId={y.id} />)}
      {/* Ordinary links, unfurled. Renders nothing until (and unless) the
          preview resolves, so a link that cannot be unfurled just stays a link.
          The card's og:image is third-party media and follows the gate. */}
      {linkUrls.map((url) => <LinkPreview key={url} url={url} showImage={media.show} />)}
      {/* Videos: inline native player, one per video */}
      {videoUrls.map((url) => (
        <VideoMedia
          key={url}
          url={url}
          authorPicture={voiceAuthorPicture}
          timestamp={voiceTimestamp}
          wide={wideMedia}
          autoLoad={media.show}
        />
      ))}
      {/* Uploaded audio uses the same waveform player as recorded voice notes. */}
      {audioUrls.map((url) => (
        <VoiceMessage
          key={url}
          note={{ url, durationSeconds: 0 }}
          authorPicture={voiceAuthorPicture}
          timestamp={voiceTimestamp}
          autoLoad={media.show}
        />
      ))}
      {/* Invoice cards hoisted out of the body text */}
      {invoices.map((inv) => (
        <InvoiceCard key={inv} invoice={inv} messageId={messageId} channelId={channelId} />
      ))}
      {gameIds.map((id) => (
        <GameCard key={id} gameId={id} />
      ))}
    </span>
  );
}
