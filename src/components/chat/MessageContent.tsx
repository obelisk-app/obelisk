'use client';

import { useMemo, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkSpoiler from '@/lib/remark-spoiler';
import { preprocessForMarkdown, MENTION_PLACEHOLDER_REGEX, isImageUrl, extractYouTubeId, extractUrls } from '@/lib/markdown';
import { useChatStore } from '@/store/chat';
import type { MemberInfo } from '@/lib/mentions';
import SpoilerText from './SpoilerText';
import CodeBlock from './CodeBlock';
import YouTubeEmbed from './YouTubeEmbed';
import LinkPreview from './LinkPreview';
import type { Components } from 'react-markdown';

function MentionChip({ pubkey, displayName }: { pubkey: string; displayName: string }) {
  return (
    <span
      className="bg-lc-green/20 text-lc-green rounded px-1 py-0.5 text-sm font-medium cursor-default"
      title={pubkey}
      data-testid="mention-highlight"
    >
      @{displayName}
    </span>
  );
}

/**
 * Swap mention placeholders in a text string with MentionChip components.
 */
function renderWithMentions(text: string, mentions: Map<string, { pubkey: string; displayName: string }>): ReactNode[] {
  MENTION_PLACEHOLDER_REGEX.lastIndex = 0;
  const parts: ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = MENTION_PLACEHOLDER_REGEX.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push(text.slice(lastIdx, match.index));
    }
    const mentionData = mentions.get(match[1]);
    if (mentionData) {
      parts.push(
        <MentionChip key={`m-${match[1]}`} pubkey={mentionData.pubkey} displayName={mentionData.displayName} />
      );
    }
    lastIdx = match.index + match[0].length;
  }

  if (lastIdx < text.length) {
    parts.push(text.slice(lastIdx));
  }

  return parts.length > 0 ? parts : [text];
}

export default function MessageContent({ content }: { content: string }) {
  const { memberList } = useChatStore();

  const { text, mentions } = useMemo(
    () => preprocessForMarkdown(content, memberList as MemberInfo[]),
    [content, memberList]
  );

  // Collect non-image, non-youtube URLs for link previews
  const previewUrls = useMemo(() => {
    const urls = extractUrls(content);
    return urls.filter(u => !isImageUrl(u) && !extractYouTubeId(u));
  }, [content]);

  const components: Components = useMemo(() => ({
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
    // Pre — just pass through, CodeBlock handles styling
    pre({ children }) {
      return <>{children}</>;
    },
    // Links — handle images, YouTube, regular links
    a({ href, children }) {
      if (!href) return <>{children}</>;

      // Image URL
      if (isImageUrl(href)) {
        return (
          <span>
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-lc-green/80 hover:underline text-xs break-all">
              {children}
            </a>
            <img
              src={href}
              alt=""
              loading="lazy"
              className="mt-1 max-w-sm max-h-80 rounded-lg object-contain bg-lc-black/50"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </span>
        );
      }

      // YouTube URL
      const ytId = extractYouTubeId(href);
      if (ytId) {
        return (
          <span>
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-lc-green/80 hover:underline break-all">
              {children}
            </a>
            <YouTubeEmbed videoId={ytId} />
          </span>
        );
      }

      // Regular link
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-lc-green/80 hover:underline break-all">
          {children}
        </a>
      );
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
    h1({ children }) { return <p className="text-lg font-bold text-lc-white">{children}</p>; },
    h2({ children }) { return <p className="text-base font-bold text-lc-white">{children}</p>; },
    h3({ children }) { return <p className="text-sm font-bold text-lc-white">{children}</p>; },
    // Text formatting
    strong({ children }) { return <strong className="font-bold text-lc-white">{processChildren(children, mentions)}</strong>; },
    em({ children }) { return <em className="italic text-lc-white/80">{processChildren(children, mentions)}</em>; },
    del({ children }) { return <del className="line-through text-lc-muted">{processChildren(children, mentions)}</del>; },
    // Lists
    ul({ children }) { return <ul className="list-disc list-inside my-1 text-lc-white/90">{children}</ul>; },
    ol({ children }) { return <ol className="list-decimal list-inside my-1 text-lc-white/90">{children}</ol>; },
    li({ children }) { return <li className="text-sm">{processChildren(children, mentions)}</li>; },
    // Paragraph — swap mention placeholders
    p({ children }) {
      return <p className="my-0">{processChildren(children, mentions)}</p>;
    },
    // Spoiler nodes (from our remark plugin)
    spoiler({ children }: { children?: ReactNode }) {
      return <SpoilerText>{children}</SpoilerText>;
    },
  }), [mentions]);

  return (
    <span data-testid="message-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkSpoiler]}
        components={components}
        // Allow our custom spoiler element
        allowedElements={undefined}
      >
        {text}
      </ReactMarkdown>
      {/* Link previews for non-image, non-youtube URLs */}
      {previewUrls.map((url) => (
        <LinkPreview key={url} url={url} />
      ))}
    </span>
  );
}

/**
 * Process React children, replacing string nodes that contain mention placeholders.
 */
function processChildren(children: ReactNode, mentions: Map<string, { pubkey: string; displayName: string }>): ReactNode {
  if (typeof children === 'string') {
    if (children.includes('\u3008MENTION:')) {
      return renderWithMentions(children, mentions);
    }
    return children;
  }

  if (Array.isArray(children)) {
    return children.map((child, i) => {
      if (typeof child === 'string' && child.includes('\u3008MENTION:')) {
        return <span key={i}>{renderWithMentions(child, mentions)}</span>;
      }
      return child;
    });
  }

  return children;
}
