import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MessageContent from './MessageContent';
import { useChatStore } from '@/store/chat';

// Mock shiki
vi.mock('shiki', () => ({
  createHighlighter: vi.fn(() => Promise.reject(new Error('mock'))),
}));

// Mock fetch for link previews
vi.spyOn(global, 'fetch').mockImplementation(() =>
  Promise.resolve({ ok: true, json: async () => ({}) } as Response)
);

describe('MessageContent', () => {
  beforeEach(() => {
    useChatStore.setState({
      ...useChatStore.getInitialState(),
      memberList: [
        { pubkey: 'a'.repeat(64), displayName: 'Alice' },
      ],
    });
  });

  it('renders plain text', () => {
    render(<MessageContent content="hello world" />);
    expect(screen.getByTestId('message-content')).toHaveTextContent('hello world');
  });

  it('renders bold text', () => {
    render(<MessageContent content="**bold text**" />);
    const strong = screen.getByTestId('message-content').querySelector('strong');
    expect(strong).toHaveTextContent('bold text');
  });

  it('renders italic text', () => {
    render(<MessageContent content="*italic text*" />);
    const em = screen.getByTestId('message-content').querySelector('em');
    expect(em).toHaveTextContent('italic text');
  });

  it('renders strikethrough text', () => {
    render(<MessageContent content="~~deleted~~" />);
    const del = screen.getByTestId('message-content').querySelector('del');
    expect(del).toHaveTextContent('deleted');
  });

  it('renders inline code', () => {
    render(<MessageContent content="use `const x = 1`" />);
    const code = screen.getByTestId('message-content').querySelector('code');
    expect(code).toHaveTextContent('const x = 1');
    expect(code).toHaveClass('bg-lc-dark');
  });

  it('renders fenced code blocks', () => {
    render(<MessageContent content={'```js\nconsole.log("hi")\n```'} />);
    expect(screen.getByTestId('code-block')).toBeInTheDocument();
  });

  it('renders mentions within markdown', () => {
    const content = `hello **nostr:npub1${'a'.repeat(64)}** world`;
    render(<MessageContent content={content} />);
    expect(screen.getByTestId('mention-highlight')).toHaveTextContent('@Alice');
  });

  it('renders links', () => {
    render(<MessageContent content="visit https://example.com today" />);
    const link = screen.getByTestId('message-content').querySelector('a');
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('renders image URLs as inline images', () => {
    render(<MessageContent content="https://example.com/photo.jpg" />);
    const img = screen.getByTestId('message-content').querySelector('img');
    expect(img).toHaveAttribute('src', 'https://example.com/photo.jpg');
  });

  it('renders blockquotes', () => {
    render(<MessageContent content="> quoted text" />);
    const bq = screen.getByTestId('message-content').querySelector('blockquote');
    expect(bq).toHaveTextContent('quoted text');
    expect(bq).toHaveClass('border-l-2');
  });

  it('renders lists', () => {
    render(<MessageContent content={"- item 1\n- item 2"} />);
    const items = screen.getByTestId('message-content').querySelectorAll('li');
    expect(items).toHaveLength(2);
  });

  it('renders /chat?c=... same-origin link as ChannelLinkPill', () => {
    // jsdom gives us window.location.origin === 'http://localhost:3000' by default
    const url = `${window.location.origin}/chat?c=plaza-publica`;
    render(<MessageContent content={`see ${url} here`} />);
    expect(screen.getByTestId('channel-link-pill')).toBeInTheDocument();
  });

  it('does not render a link-preview card for same-origin /chat?c=... deep-links', () => {
    // Internal chat deep-links should only show as a pill — no preview card.
    const url = `${window.location.origin}/chat?c=las-3-cosas&m=abc123`;
    render(<MessageContent content={`check ${url}`} />);
    expect(screen.getByTestId('channel-link-pill')).toBeInTheDocument();
    expect(screen.queryByTestId('link-preview')).not.toBeInTheDocument();
  });
});
