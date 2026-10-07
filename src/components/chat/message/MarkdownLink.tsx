'use client';

import type { ReactNode } from 'react';
import { isImageUrl } from '@/utils/message-text/markdown';
import { isUploadUrl, filenameFromUrl } from '@/utils/attachments/attachments';
import { autolinkLabel } from '@/utils/message-text/autolink-label';
import { chatLinkTarget } from '@/utils/message-text/chat-link';
import { hideBrokenImage } from '@/utils/chat/message/hide-broken-image';
import { followInAppLink } from '@/services/chat/message/in-app-link';
import RemoteImage from '@/components/ui/media/RemoteImage';
import ChannelLinkPill from './ChannelLinkPill';
import AttachmentCard from './AttachmentCard';

/**
 * A markdown link in a message body. Its `href` has already passed
 * react-markdown's default URL sanitizer, so a `javascript:` link arrives
 * here empty and renders as its text alone.
 */
export function MarkdownLink({ href, children, mediaShow }: { href?: string; children?: ReactNode; mediaShow: boolean }) {
  if (!href) return <>{children}</>;

  // Hashtags link to Obelisk's own /t/<tag> page, not a third party.
  if (href.startsWith('/t/')) {
    return (
      <a
        href={href}
        // Not `break-all`: it split `#RUNSTR` across lines as `#RU` /
        // `NSTR`. A hashtag is one token and wraps at its own
        // boundaries. These also reset the `overflow-wrap: anywhere` /
        // `word-break: break-word` that `.note-media` sets on the whole
        // note body, which is inherited and would otherwise win.
        className="[overflow-wrap:normal] [word-break:normal] text-sky-400 hover:underline"
        data-testid="nostr-hashtag"
      >
        {children}
      </a>
    );
  }

  // Image URL: render only the image, suppress raw URL text. While the
  // remote-media gate is closed it falls through to a plain link.
  if (isImageUrl(href) && mediaShow) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="block">
        <RemoteImage
          src={href}
          alt=""
          className="mt-1 max-w-sm max-h-80 rounded-lg object-contain bg-lc-black/50"
          onError={hideBrokenImage}
        />
      </a>
    );
  }

  // Uploaded attachment (non-image): render as download card only
  if (isUploadUrl(href)) return <AttachmentCard url={href} name={filenameFromUrl(href)} />;

  // YouTube URL: raw pastes are hoisted out of the body and rendered
  // as a real embed. Explicit `[label](yt-url)` markdown links fall
  // through to a plain link so we never put a <div> inside <p>.

  // Same-origin /chat?c=<slug>[&m=|&p=] links render as a Discord-style
  // pill (#slug, with ↩ prefix for deep-links to specific messages or
  // posts) and navigate smoothly via pushState + popstate, no full
  // reload.
  const chat = chatLinkTarget(href);
  if (chat?.slug) {
    return <ChannelLinkPill href={href} slug={chat.slug} messageId={chat.messageId} postId={chat.postId} />;
  }
  if (chat) {
    // Fallback: other /chat URLs without a slug (e.g. profile deep-links)
    return (
      <a href={href} className="text-lc-green/80 hover:underline break-all" onClick={(e) => followInAppLink(e, chat.path)}>
        {children}
      </a>
    );
  }

  // Regular link
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={href}
      className="text-lc-green/80 hover:underline break-all"
    >
      {autolinkLabel(href, children) ?? children}
    </a>
  );
}
