/**
 * The element renderers handed to react-markdown for a message body.
 *
 * Every `href` and `src` these renderers receive has already passed
 * react-markdown's default URL sanitizer (`urlTransform`, which
 * MarkdownBody leaves at its default), so a `javascript:` link arrives
 * here as an empty href. Raw HTML never reaches them either: MarkdownBody
 * passes no `rehype-raw`, so HTML in a message renders as text.
 *
 * A markup factory: each entry renders one component from `./`, which holds
 * the logic (links in `MarkdownLink`, images in `MarkdownImage`, code in
 * `MarkdownCode`, placeholder chips in `MarkdownInline`).
 */
import type { ReactNode } from 'react';
import type { Components } from 'react-markdown';
import type { MentionMap } from '@/utils/message-text/placeholder-segments';
import SpoilerText from './SpoilerText';
import { MarkdownCode } from './MarkdownCode';
import { MarkdownImage } from './MarkdownImage';
import { MarkdownLink } from './MarkdownLink';
import { MarkdownInline } from './MarkdownInline';

export interface MarkdownComponentOptions {
  mentions: MentionMap;
  renderEmojis: Record<string, string>;
  /** The remote-media gate is open: sender-chosen images may load. */
  mediaShow: boolean;
  mediaReveal: () => void;
}

export function buildMarkdownComponents({
  mentions,
  renderEmojis,
  mediaShow,
  mediaReveal,
}: MarkdownComponentOptions): Components {
  return {
    // Code blocks and inline code
    code: (props) => <MarkdownCode {...props} />,
    // Pre: just pass through, CodeBlock handles styling
    pre: ({ children }) => <>{children}</>,
    img: ({ src, alt }) => <MarkdownImage src={src} alt={alt} mediaShow={mediaShow} mediaReveal={mediaReveal} />,
    // Links: images, uploads, in-app links and regular links
    a: ({ href, children }) => <MarkdownLink href={href} mediaShow={mediaShow}>{children}</MarkdownLink>,
    blockquote: ({ children }) => (
      <blockquote className="border-l-2 border-lc-green/40 pl-3 my-1 text-lc-muted italic">
        {children}
      </blockquote>
    ),
    // Headings (limited like Discord)
    h1: ({ children }) => <p className="text-lg font-bold text-lc-white"><MarkdownInline mentions={mentions} emojis={renderEmojis}>{children}</MarkdownInline></p>,
    h2: ({ children }) => <p className="text-base font-bold text-lc-white"><MarkdownInline mentions={mentions} emojis={renderEmojis}>{children}</MarkdownInline></p>,
    h3: ({ children }) => <p className="text-sm font-bold text-lc-white"><MarkdownInline mentions={mentions} emojis={renderEmojis}>{children}</MarkdownInline></p>,
    // Text formatting
    strong: ({ children }) => <strong className="font-bold text-lc-white"><MarkdownInline mentions={mentions} emojis={renderEmojis}>{children}</MarkdownInline></strong>,
    em: ({ children }) => <em className="italic text-lc-white/80"><MarkdownInline mentions={mentions} emojis={renderEmojis}>{children}</MarkdownInline></em>,
    del: ({ children }) => <del className="line-through text-lc-muted"><MarkdownInline mentions={mentions} emojis={renderEmojis}>{children}</MarkdownInline></del>,
    // Lists
    ul: ({ children }) => <ul className="list-disc list-inside my-1 text-lc-white/90">{children}</ul>,
    ol: ({ children }) => <ol className="list-decimal list-inside my-1 text-lc-white/90">{children}</ol>,
    li: ({ children }) => <li className="text-sm"><MarkdownInline mentions={mentions} emojis={renderEmojis}>{children}</MarkdownInline></li>,
    // Paragraph: swap mention placeholders
    p: ({ children }) => <p className="my-0"><MarkdownInline mentions={mentions} emojis={renderEmojis}>{children}</MarkdownInline></p>,
    // Spoiler nodes (from our remark plugin)
    spoiler: ({ children }: { children?: ReactNode }) => <SpoilerText>{children}</SpoilerText>,
  } as Components;
}
