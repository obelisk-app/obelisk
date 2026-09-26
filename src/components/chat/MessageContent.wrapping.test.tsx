import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { nip19 } from 'nostr-tools';
import { linkifyHashtags } from '@/lib/profile-feed';

vi.mock('@/lib/nostr-bridge', () => ({
  useGroupMemberInfo: () => [],
  useMediaPacks: () => ({}),
  useUserMetadata: () => ({ displayName: 'Fabricio' }),
}));

import MessageContent from './MessageContent';

/**
 * A hashtag is one token. `break-all` on the anchor — plus the
 * `overflow-wrap: anywhere` the note body sets and every child inherits —
 * rendered `#RUNSTR` as `#RU` / `NSTR` across two lines on mobile.
 */
describe('token wrapping', () => {
  it('does not let a hashtag break mid-word', () => {
    // The feed hands MessageContent the linkified form; that anchor is
    // where the `break-all` lived.
    render(<MessageContent content={linkifyHashtags('training with #RUNSTR today')} />);
    const tag = screen.getByTestId('nostr-hashtag');
    expect(tag.className).not.toContain('break-all');
    expect(tag).toHaveTextContent('#RUNSTR');
  });

  it('resets the inherited break rules on a hashtag', () => {
    // The container sets `overflow-wrap: anywhere; word-break: break-word`,
    // which is inherited — overriding it on the token is the actual fix.
    render(<MessageContent content={linkifyHashtags('#RUNSTR')} />);
    const tag = screen.getByTestId('nostr-hashtag');
    expect(tag.className).toContain('[overflow-wrap:normal]');
    expect(tag.className).toContain('[word-break:normal]');
  });

  it('does not let a mention break mid-word either', () => {
    const npub = nip19.npubEncode('d'.repeat(64));
    render(<MessageContent content={`hey nostr:${npub}`} />);
    const chip = screen.getByTestId('mention-highlight');
    expect(chip.className).toContain('[overflow-wrap:normal]');
    expect(chip).toHaveTextContent('@Fabricio');
  });

  it('still lets a long URL break, because it has to fit somehow', () => {
    render(<MessageContent content="see https://example.com/a/very/long/path?x=1" />);
    const link = screen.getByRole('link');
    expect(link.className).toContain('break-all');
  });
});

describe('long urls', () => {
  // A zap.cooking share link rendered as five lines of unbroken characters.
  const LONG = 'https://zap.cooking/recipe/naddr1qvzqqqrcvypzq0mhp4ja8fmy48zug5zxncyxpjyq9vzxmh7xhx8fhmfjkc0tz5lqqxnzde3xg6rjde5xumrzvfjxserzwfn';

  it('shortens the label but keeps the href intact', () => {
    render(<MessageContent content={`see ${LONG}`} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', LONG);
    expect(link.textContent!.length).toBeLessThan(LONG.length);
    expect(link.textContent).toMatch(/…$/);
  });

  it('leads with the host, so you can tell where it goes', () => {
    render(<MessageContent content={LONG} />);
    expect(screen.getByRole('link').textContent).toMatch(/^zap\.cooking/);
  });

  it('keeps the whole url available on hover', () => {
    render(<MessageContent content={LONG} />);
    expect(screen.getByRole('link')).toHaveAttribute('title', LONG);
  });

  it('leaves a short url exactly as written', () => {
    const short = 'https://obelisk.ar/guides';
    render(<MessageContent content={short} />);
    expect(screen.getByRole('link')).toHaveTextContent(short);
  });

  it('never rewrites link text the author chose', () => {
    render(<MessageContent content={`[my recipe](${LONG})`} />);
    expect(screen.getByRole('link')).toHaveTextContent('my recipe');
  });
});
