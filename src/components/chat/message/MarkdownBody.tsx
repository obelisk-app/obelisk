'use client';

/**
 * The markdown half of a message body, kept in its own file so
 * `MessageContent` can load it on demand: react-markdown, remark-gfm and the
 * micromark parser are a large part of the chat bundle, and nothing outside a
 * rendered message needs them.
 *
 * The two security rules from `MessageContent` live here now and must not
 * move: no `rehype-raw` (raw HTML in a message renders as text, never as
 * markup) and no `urlTransform` override (react-markdown's default sanitizer
 * is what keeps a `javascript:` URL out of every `href`).
 */
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkSpoiler from '@/lib/remark-spoiler';

const REMARK_PLUGINS = [remarkGfm, remarkSpoiler];

export default function MarkdownBody({ text, components }: { text: string; components: Components }) {
  return (
    <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={components}>
      {text}
    </ReactMarkdown>
  );
}
