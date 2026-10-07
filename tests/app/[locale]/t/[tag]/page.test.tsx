import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { LocaleProvider, translator } from '@tests/support/intl';
import { shortNpubLabel } from '@/utils/identity/short-npub';

const mocks = vi.hoisted(() => ({ notes: vi.fn(), profiles: vi.fn() }));

vi.mock('@/services/server/i18n/locale', async () => {
  const { translator: tr } = await import('@tests/support/intl');
  return { serverLocale: async () => ({ locale: 'en', t: tr('en') }) };
});
vi.mock('@/i18n/navigation', async () => (await import('@tests/support/mocks/i18n-navigation')).navigationMock());
vi.mock('@/services/server/viewer/nostr-fetch', async (orig) => ({
  ...(await orig<object>()),
  fetchHashtagNotes: mocks.notes,
  fetchProfilesForViewer: mocks.profiles,
}));
vi.mock('@/components/social/tags/FollowTagButton', () => ({ default: ({ tag }: { tag: string }) => <span data-testid="follow-tag">{tag}</span> }));
vi.mock('@/components/social/viewer/ViewerHeader', () => ({ default: () => <header /> }));

import HashtagPage from '@/app/[locale]/t/[tag]/page';

const t = translator('en');
const A = 'a'.repeat(64);
const B = 'b'.repeat(64);

async function show(tag: string) {
  const element = await HashtagPage({ params: Promise.resolve({ tag, locale: 'en' }) });
  return render(<LocaleProvider initialLocale="en">{element as ReactElement}</LocaleProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.notes.mockResolvedValue([]);
  mocks.profiles.mockResolvedValue([]);
});

describe('the hashtag page', () => {
  it('says the tag is not one, without asking the relays, for a segment that is not a hashtag', async () => {
    await show('%%%');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(t('social.tagPage.notFound'));
    expect(mocks.notes).not.toHaveBeenCalled();
  });

  it('says when there are no recent notes', async () => {
    await show('nostr');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('#nostr');
    expect(screen.getByTestId('follow-tag')).toHaveTextContent('nostr');
    expect(screen.getByText(t('social.tagPage.none'))).toBeInTheDocument();
  });

  it('lists recent notes with their author, date, text and first image', async () => {
    mocks.notes.mockResolvedValue([
      { id: '1'.repeat(64), pubkey: A, kind: 1, created_at: 1700000000, content: 'hello https://x.example/p.png', tags: [['imeta', 'url https://x.example/p.png']], sig: '' },
      { id: '2'.repeat(64), pubkey: B, kind: 1, created_at: 1700000100, content: '', tags: [], sig: '' },
      { id: '3'.repeat(64), pubkey: A, kind: 1, created_at: 1700000200, content: 'again', tags: [], sig: '' },
    ]);
    mocks.profiles.mockResolvedValue([{ pubkey: A, name: 'alice', displayName: null, picture: 'https://x.example/a.png' }]);
    await show('nostr');
    expect(mocks.profiles).toHaveBeenCalledWith([A, B]);
    expect(screen.getByText(t('social.tagPage.recent', { count: 3 }))).toBeInTheDocument();
    const items = within(screen.getByTestId('hashtag-notes')).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('alice');
    expect(items[0].querySelector('a')?.getAttribute('href')).toMatch(/^\/notes\/nevent1/);
    expect(items[0].querySelectorAll('img')).toHaveLength(2);
    expect(items[1]).toHaveTextContent(shortNpubLabel(B));
    expect(items[1]).toHaveTextContent(t('social.viewer.sharedMedia'));
    expect(items[1]).toHaveTextContent(shortNpubLabel(B).slice(0, 1).toUpperCase());
  });
});
