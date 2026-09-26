import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import { LocaleProvider } from '@/i18n/context';

import TrendingWidget from './TrendingWidget';

/** The follow button needs a signed-in identity and the interests store. */
vi.mock('@/lib/nostr-bridge', () => ({ useMyPubkey: () => null }));

const note = (id: string, pubkey: string, tags: string[]): NostrEvent => ({
  id,
  pubkey,
  kind: 1,
  content: '',
  created_at: 1,
  sig: '',
  tags: tags.map((tag) => ['t', tag]),
});

const renderPanel = (notes: NostrEvent[], props: Record<string, unknown> = {}) => render(
  <LocaleProvider initialLocale="en">
    <TrendingWidget notes={notes} {...props} />
  </LocaleProvider>,
);

describe('TrendingWidget', () => {
  // A tag needs to clear `trendingTags`' floor to be listed at all — one
  // note is not a trend, and the panel used to show rows reading "1".
  const trending = (tag: string) => ['a', 'b', 'c'].map((author, i) => note(String(i), author, [tag]));

  it('lists what the loaded feed is about', () => {
    renderPanel(trending('bitcoin'));
    expect(screen.getByTestId('trending-tag')).toHaveTextContent('#bitcoin');
  });

  it('searches the tag when one is clicked', () => {
    const onOpenTag = vi.fn();
    renderPanel(trending('art'), { onOpenTag });
    fireEvent.click(screen.getByTestId('trending-tag'));
    expect(onOpenTag).toHaveBeenCalledWith('art');
  });

  it('says so rather than rendering an empty box', () => {
    renderPanel([note('1', 'a', [])]);
    expect(screen.getByTestId('feed-trending-empty')).toBeInTheDocument();
  });

  it('stays quiet rather than listing a tag seen once', () => {
    // `#esim · 1` was being presented as trending.
    renderPanel([note('1', 'a', ['esim'])]);
    expect(screen.getByTestId('feed-trending-empty')).toBeInTheDocument();
  });

});
