import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@/services/nostr-bridge', async () => {
  const { bridgeMock } = await import('@tests/support/mocks/nostr-bridge');
  return bridgeMock({
    useGroupMemberInfo: () => [],
    useMediaPacks: () => ({}),
    useUserMetadata: () => null,
  });
});
vi.mock('@/components/chat/LinkPreview', () => ({ default: () => null }));

import MessageContent from '@/components/chat/MessageContent';
import { preloadMarkdownBody } from '@/components/chat/message/useMarkdownBody';

// The markdown renderer loads on demand; load it first so every render below is the real one.
beforeAll(async () => { await preloadMarkdownBody(); });

/**
 * Message bodies are sender-authored. These pin the two rules the split of
 * MessageContent into `./message/` must not loosen.
 */
describe('MessageContent security', () => {
  it('never lets a javascript: URL reach an href', () => {
    const { container } = render(<MessageContent content="[click me](javascript:alert(1))" />);
    const link = screen.getByText('click me').closest('a');
    expect(link?.getAttribute('href') ?? '').not.toMatch(/javascript:/i);
    expect(container.innerHTML).not.toMatch(/javascript:/i);
  });

  it('drops a javascript: image source too', () => {
    const { container } = render(<MessageContent content="![x](javascript:alert(1))" />);
    expect(container.innerHTML).not.toMatch(/javascript:/i);
  });

  it('renders raw HTML as text, never as markup', () => {
    const { container } = render(
      <MessageContent content={'hello <b data-testid="raw-b">bold</b> <img src=x onerror="alert(1)"> <script>alert(1)</script>'} />,
    );
    // The real markdown renderer ran (not the plain-text stand-in shown while it loads).
    expect(screen.queryByTestId('message-text-loading')).toBeNull();
    expect(container.querySelector('p')).not.toBeNull();
    expect(screen.queryByTestId('raw-b')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('[onerror]')).toBeNull();
  });
});

describe('the on-demand markdown module keeps both rules', () => {
  const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');

  it('MessageContent does not import react-markdown itself, so the chat downloads it on demand', () => {
    const src = read('src/components/chat/MessageContent.tsx');
    expect(src).not.toMatch(/from 'react-markdown'/);
    expect(src).not.toMatch(/from 'remark-gfm'/);
  });

  it('MarkdownBody passes no raw-HTML plugin and no URL transform', () => {
    const src = read('src/components/chat/message/MarkdownBody.tsx').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(src).not.toMatch(/rehype-raw|rehypeRaw|rehypePlugins/);
    expect(src).not.toMatch(/urlTransform|transformLinkUri|skipHtml=\{false\}/);
  });
});
