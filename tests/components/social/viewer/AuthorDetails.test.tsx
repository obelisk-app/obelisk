import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import type { Event as NostrEvent } from 'nostr-tools';
import { nip19 } from 'nostr-tools';
import { LocaleProvider, translator } from '@tests/support/intl';

vi.mock('@/services/server/i18n/locale', async () => {
  const { translator: tr } = await import('@tests/support/intl');
  return { serverLocale: async () => ({ locale: 'en', t: tr('en') }) };
});
vi.mock('@/i18n/navigation', async () => (await import('@tests/support/mocks/i18n-navigation')).navigationMock());

import AuthorDetails from '@/components/social/viewer/AuthorDetails';
import type { ViewerProfile } from '@/services/server/viewer/nostr-fetch';

const t = translator('en');
const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const profile = (pubkey: string, over: Partial<ViewerProfile> = {}): ViewerProfile => ({
  pubkey, name: null, displayName: null, about: null, picture: null, banner: null, nip05: null, website: null, lud16: null, ...over,
} as ViewerProfile);
const note = (id: string, content: string): NostrEvent => ({ id: id.repeat(64), pubkey: A, kind: 1, created_at: 1700000000, content, tags: [], sig: '' });

async function show(props: Partial<Parameters<typeof AuthorDetails>[0]>) {
  const element = await AuthorDetails({
    author: profile(A, { name: 'alice' }), notes: [], hashtags: [], follows: [], relays: { read: [], write: [] }, ...props,
  });
  if (!element) return null;
  return render(<LocaleProvider initialLocale="en">{element as ReactElement}</LocaleProvider>);
}

describe('the context beside a note', () => {
  it('renders nothing when there is nothing to add', async () => {
    expect(await show({})).toBeNull();
  });

  it('links more notes from the author as plain text, with a fallback for media-only notes', async () => {
    await show({ notes: [note('1', '**bold** words'), note('2', '')] });
    const section = screen.getByTestId('author-more-notes');
    expect(section).toHaveTextContent(t('social.viewer.moreFrom', { name: 'alice' }));
    const links = within(section).getAllByRole('link');
    expect(links[0].getAttribute('href')).toMatch(/^\/notes\/nevent1/);
    expect(links[0]).toHaveTextContent('bold words');
    expect(links[1]).toHaveTextContent(t('social.viewer.sharedMedia'));
    expect(section.querySelector('time')).toHaveAttribute('dateTime', new Date(1700000000 * 1000).toISOString());
  });

  it('links each hashtag to its tag page', async () => {
    await show({ hashtags: ['nostr', 'a b'] });
    const links = within(screen.getByTestId('author-hashtags')).getAllByRole('link');
    expect(links.map((l) => [l.getAttribute('href'), l.textContent])).toEqual([['/t/nostr', '#nostr'], ['/t/a%20b', '#a b']]);
  });

  it('links each followed person to their profile by npub, with a picture or their initial', async () => {
    await show({ follows: [profile(B, { name: 'bob', picture: 'https://x.example/b.png' }), profile('zz', { name: 'zed' })] });
    const links = within(screen.getByTestId('author-follows')).getAllByRole('link');
    expect(links[0]).toHaveAttribute('href', `/p/${nip19.npubEncode(B)}`);
    expect(links[0].querySelector('img')).not.toBeNull();
    expect(links[1]).toHaveAttribute('href', '/p/zz');
    expect(links[1]).toHaveTextContent('Zzed');
  });

  it('lists up to six write relays by host, keeping an address that does not parse readable', async () => {
    await show({ relays: { read: [], write: ['wss://r1.example/', 'not a url///', 'wss://r2', 'wss://r3', 'wss://r4', 'wss://r5', 'wss://r6'] } });
    const items = within(screen.getByTestId('author-relays')).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual(['r1.example', 'not a url', 'r2', 'r3', 'r4', 'r5']);
  });
});
