import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithBridge } from '@tests/support/render-with-bridge';
import { fakeBridge } from '@tests/support/fake-bridge';
import MarkdownBody from '@/components/chat/message/MarkdownBody';
import { buildMarkdownComponents } from '@/components/chat/message/markdown-components';
import { EVERYONE_PLACEHOLDER } from '@/constants/message-text/markdown';

const mentions = new Map([['0', { pubkey: 'a'.repeat(64), displayName: 'Alice' }]]);
const emojis = { party: 'https://x/party.png' };

function show(text: string, opts: { mediaShow?: boolean; reveal?: () => void } = {}) {
  const components = buildMarkdownComponents({
    mentions, renderEmojis: emojis, mediaShow: opts.mediaShow ?? true, mediaReveal: opts.reveal ?? (() => {}),
  });
  return renderWithBridge(<MarkdownBody text={text} components={components} />, fakeBridge());
}

describe('markdown renderers', () => {
  afterEach(() => window.history.replaceState(null, '', '/'));

  it('headings render as styled paragraphs and swap placeholders', () => {
    const { container } = show('# Hi 〈MENTION:0〉\n\n## two\n\n### three');
    expect(container.querySelector('h1')).toBeNull();
    const ps = container.querySelectorAll('p');
    expect(ps[0]).toHaveClass('text-lg', 'font-bold');
    expect(ps[1]).toHaveClass('text-base');
    expect(ps[2]).toHaveClass('text-sm');
    expect(screen.getByTestId('mention-highlight')).toHaveTextContent('@Alice');
  });

  it('emphasis, strong, strikethrough and list items swap placeholders too', () => {
    show(`*a 〈EMOJI:party〉* **b ${EVERYONE_PLACEHOLDER}** ~~c~~\n\n- item 〈EMOJI:party〉\n\n1. one`);
    expect(screen.getAllByTestId('custom-emoji')).toHaveLength(2);
    expect(screen.getByTestId('everyone-mention')).toBeInTheDocument();
    expect(document.querySelector('del')).toHaveClass('line-through');
    expect(document.querySelector('ul')).toHaveClass('list-disc');
    expect(document.querySelector('ol')).toHaveClass('list-decimal');
  });

  it('inline code stays inline; a fenced block becomes a code block with its language', () => {
    const { container } = show('use `x` here\n\n```ts\nconst a = 1;\n```');
    expect(container.querySelector('p code')).toHaveClass('font-mono');
    expect(screen.getByText('ts')).toBeInTheDocument();
    expect(container.textContent).toContain('const a = 1;');
  });

  it('a blockquote and a spoiler', () => {
    const { container } = show('> quoted\n\n||secret||');
    expect(container.querySelector('blockquote')).toHaveClass('border-l-2');
    expect(screen.getByTestId('spoiler-text')).toHaveTextContent('secret');
  });

  it('links: hashtags stay in the app, regular links open a new tab, uploads become cards', () => {
    const { container } = show('[#tag](/t/tag) [site](https://example.com/page) [file](https://h.example/uploads/a.pdf)');
    expect(screen.getByTestId('nostr-hashtag')).toHaveAttribute('href', '/t/tag');
    const site = screen.getByText('site').closest('a')!;
    expect(site).toHaveAttribute('target', '_blank');
    expect(site).toHaveAttribute('rel', 'noopener noreferrer');
    expect(site).toHaveAttribute('title', 'https://example.com/page');
    expect(container.textContent).toContain('a.pdf');
  });

  it('an image link shows the image while the gate is open, and hides it when it fails', () => {
    const { container } = show('[pic](https://example.com/a.png)');
    const img = container.querySelector('a img') as HTMLImageElement;
    expect(img).not.toBeNull();
    fireEvent.error(img);
    expect(img.style.display).toBe('none');
  });

  it('with the gate closed, an image link is a plain link and a markdown image waits behind a placeholder', () => {
    const reveal = vi.fn();
    const { container } = show('[pic](https://example.com/a.png)\n\n![alt](https://example.com/b.png)', { mediaShow: false, reveal });
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('pic').closest('a')).toHaveAttribute('href', 'https://example.com/a.png');
  });

  it('a same-origin app link without a channel navigates in place on a plain click, not on a modified one', () => {
    const href = `${window.location.origin}/app?u=abc`;
    const pops = vi.fn();
    window.addEventListener('popstate', pops);
    show(`[profile](${href})`);
    const link = screen.getByText('profile').closest('a')!;
    fireEvent.click(link, { metaKey: true });
    expect(pops).not.toHaveBeenCalled();
    fireEvent.click(link);
    expect(pops).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe('?u=abc');
    window.removeEventListener('popstate', pops);
  });

  it('a same-origin app link with a channel becomes a pill', () => {
    show(`[c](${window.location.origin}/app?c=general)`);
    expect(screen.getByTestId('channel-link-pill')).toHaveTextContent('#general');
  });
});
