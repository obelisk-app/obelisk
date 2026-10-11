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
import List from '@/components/ui/layout/List';
import type { ReactNode } from 'react';
import type { Components } from 'react-markdown';
import type { MentionMap } from '@/utils/message-text/placeholder-segments';
import SpoilerText from './SpoilerText';
import { MarkdownCode } from './MarkdownCode';
import { MarkdownImage } from './MarkdownImage';
import { MarkdownLink } from './MarkdownLink';
import { MarkdownInline } from './MarkdownInline';
import Text from '@/components/ui/layout/Text';

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
    // Headings (limited like Discord): three clear steps above body text,
    // kept as paragraphs so a message never adds to the page outline.
    h1: ({ children }) => <Text as="p" size="2xl" tone="default" weight="bold" className="mt-2 mb-1 leading-tight"><MarkdownInline mentions={mentions} emojis={renderEmojis}>{children}</MarkdownInline></Text>,
    h2: ({ children }) => <Text as="p" size="xl" tone="default" weight="bold" className="mt-2 mb-1 leading-tight"><MarkdownInline mentions={mentions} emojis={renderEmojis}>{children}</MarkdownInline></Text>,
    h3: ({ children }) => <Text as="p" size="lg" tone="default" weight="bold" className="mt-1 mb-0.5 leading-snug"><MarkdownInline mentions={mentions} emojis={renderEmojis}>{children}</MarkdownInline></Text>,
    // Text formatting
    strong: ({ children }) => <strong className="font-bold text-lc-white"><MarkdownInline mentions={mentions} emojis={renderEmojis}>{children}</MarkdownInline></strong>,
    em: ({ children }) => <em className="italic text-lc-white/80"><MarkdownInline mentions={mentions} emojis={renderEmojis}>{children}</MarkdownInline></em>,
    del: ({ children }) => <del className="line-through text-lc-muted"><MarkdownInline mentions={mentions} emojis={renderEmojis}>{children}</MarkdownInline></del>,
    // Lists
    ul: ({ children }) => <List marker="inside" spacing="none" className="my-1 text-lc-white/90">{children}</List>,
    ol: ({ children }) => <List as="ol" marker="inside" spacing="none" className="my-1 text-lc-white/90">{children}</List>,
    li: ({ children }) => <li className="text-sm whitespace-pre-line"><MarkdownInline mentions={mentions} emojis={renderEmojis}>{children}</MarkdownInline></li>,
    // Paragraph: swap mention placeholders. `pre-line` keeps a single
    // newline (Shift+Enter in the composer, or any Nostr client) as a line
    // break instead of collapsing it into a space.
    p: ({ children }) => <Text as="p" className="my-0 whitespace-pre-line"><MarkdownInline mentions={mentions} emojis={renderEmojis}>{children}</MarkdownInline></Text>,
    // Spoiler nodes (from our remark plugin)
    spoiler: ({ children }: { children?: ReactNode }) => <SpoilerText>{children}</SpoilerText>,
  } as Components;
}
