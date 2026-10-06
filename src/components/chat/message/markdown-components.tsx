/**
 * The element renderers handed to react-markdown for a message body.
 *
 * Every `href` and `src` these renderers receive has already passed
 * react-markdown's default URL sanitizer (`urlTransform`, which
 * MessageContent leaves at its default), so a `javascript:` link arrives
 * here as an empty href. Raw HTML never reaches them either: MessageContent
 * passes no `rehype-raw`, so HTML in a message renders as text.
 */
import type { MouseEvent, ReactNode } from 'react';
import type { Components } from 'react-markdown';
import { isImageUrl } from '@/utils/message-text/markdown';
import { isUploadUrl, filenameFromUrl } from '@/utils/attachments/attachments';
import { isSameOriginMediaUrl } from '@/services/remote-media';
import RemoteImage from '@/components/ui/RemoteImage';
import SpoilerText from '../SpoilerText';
import CodeBlock from '../CodeBlock';
import ChannelLinkPill from '../ChannelLinkPill';
import AttachmentCard from '../AttachmentCard';
import { RemoteMediaPlaceholder } from '../RemoteMediaPlaceholder';
import { autolinkLabel } from '@/utils/message-text/autolink-label';
import { chatLinkTarget, navigateInApp } from '@/utils/message-text/chat-link';
import { processChildren, type MentionMap } from './placeholders';

export interface MarkdownComponentOptions {
  mentions: MentionMap;
  renderEmojis: Record<string, string>;
  /** The remote-media gate is open: sender-chosen images may load. */
  mediaShow: boolean;
  mediaReveal: () => void;
}

function renderLink(href: string | undefined, children: ReactNode, mediaShow: boolean): ReactNode {
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
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      </a>
    );
  }

  // Uploaded attachment (non-image): render as download card only
  if (isUploadUrl(href)) {
    return <AttachmentCard url={href} name={filenameFromUrl(href)} />;
  }

  // YouTube URL: raw pastes are hoisted out of the body and rendered
  // as a real embed. Explicit `[label](yt-url)` markdown links fall
  // through to a plain link so we never put a <div> inside <p>.

  // Same-origin /chat?c=<slug>[&m=|&p=] links render as a Discord-style
  // pill (#slug, with ↩ prefix for deep-links to specific messages or
  // posts) and navigate smoothly via pushState + popstate, no full
  // reload.
  const chat = chatLinkTarget(href);
  if (chat) {
    if (chat.slug) {
      return (
        <ChannelLinkPill
          href={href}
          slug={chat.slug}
          messageId={chat.messageId}
          postId={chat.postId}
        />
      );
    }
    const onClick = (e: MouseEvent) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      navigateInApp(chat.path);
    };
    // Fallback: other /chat URLs without a slug (e.g. profile deep-links)
    return (
      <a
        href={href}
        className="text-lc-green/80 hover:underline break-all"
        onClick={onClick}
      >
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

export function buildMarkdownComponents({
  mentions,
  renderEmojis,
  mediaShow,
  mediaReveal,
}: MarkdownComponentOptions): Components {
  const inline = (children: ReactNode) => processChildren(children, mentions, renderEmojis);
  return {
    // Code blocks and inline code
    code({ className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || '');
      const codeStr = String(children).replace(/\n$/, '');
      // Fenced code block (has language class or is inside pre)
      if (match || (props.node?.position && codeStr.includes('\n'))) {
        return <CodeBlock code={codeStr} language={match?.[1]} />;
      }
      // Inline code
      return (
        <code className="bg-lc-dark text-lc-green px-1.5 py-0.5 rounded text-[0.85em] font-mono" {...props}>
          {children}
        </code>
      );
    },
    // Pre: just pass through, CodeBlock handles styling
    pre({ children }) {
      return <>{children}</>;
    },
    // Markdown images (`![alt](url)`). Bare URLs are hoisted into the gallery
    // above, so this is the explicit form; it obeys the same gate.
    img({ src, alt }) {
      if (!src) return null;
      const href = String(src);
      if (!mediaShow && !isSameOriginMediaUrl(href)) {
        return <RemoteMediaPlaceholder onReveal={mediaReveal} compact />;
      }
      return (
        <RemoteImage
          src={href}
          alt={alt ?? ''}
          className="mt-1 max-w-sm max-h-80 rounded-lg object-contain bg-lc-black/50"
        />
      );
    },
    // Links: handle images, YouTube, regular links
    a({ href, children }) {
      return renderLink(href, children, mediaShow);
    },
    // Blockquote
    blockquote({ children }) {
      return (
        <blockquote className="border-l-2 border-lc-green/40 pl-3 my-1 text-lc-muted italic">
          {children}
        </blockquote>
      );
    },
    // Headings (limited like Discord)
    h1({ children }) { return <p className="text-lg font-bold text-lc-white">{inline(children)}</p>; },
    h2({ children }) { return <p className="text-base font-bold text-lc-white">{inline(children)}</p>; },
    h3({ children }) { return <p className="text-sm font-bold text-lc-white">{inline(children)}</p>; },
    // Text formatting
    strong({ children }) { return <strong className="font-bold text-lc-white">{inline(children)}</strong>; },
    em({ children }) { return <em className="italic text-lc-white/80">{inline(children)}</em>; },
    del({ children }) { return <del className="line-through text-lc-muted">{inline(children)}</del>; },
    // Lists
    ul({ children }) { return <ul className="list-disc list-inside my-1 text-lc-white/90">{children}</ul>; },
    ol({ children }) { return <ol className="list-decimal list-inside my-1 text-lc-white/90">{children}</ol>; },
    li({ children }) { return <li className="text-sm">{inline(children)}</li>; },
    // Paragraph: swap mention placeholders
    p({ children }) {
      return <p className="my-0">{inline(children)}</p>;
    },
    // Spoiler nodes (from our remark plugin)
    spoiler({ children }: { children?: ReactNode }) {
      return <SpoilerText>{children}</SpoilerText>;
    },
  } as Components;
}
