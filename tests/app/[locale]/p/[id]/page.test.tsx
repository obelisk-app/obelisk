import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nip19 } from 'nostr-tools';

const mocks = vi.hoisted(() => ({ author: vi.fn() }));

vi.mock('next/navigation', async (orig) => ({
  ...(await orig<object>()),
  notFound: () => { throw new Error('NEXT_NOT_FOUND'); },
}));
vi.mock('@/services/server/i18n/locale', async () => {
  const { translator: tr } = await import('@tests/support/intl');
  return { serverLocale: async () => ({ locale: 'en', t: tr('en') }) };
});
vi.mock('next-intl/server', async (orig) => {
  const { translator: tr } = await import('@tests/support/intl');
  return { ...(await orig<object>()), getTranslations: async () => tr('en') };
});
vi.mock('@/services/server/viewer/nostr-fetch', async (orig) => ({ ...(await orig<object>()), fetchAuthorForViewer: mocks.author }));

import ProfileViewerPage, { generateMetadata } from '@/app/[locale]/p/[id]/page';

const params = (id: string) => Promise.resolve({ id });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.author.mockResolvedValue(null);
});

describe('the public profile page', () => {
  it('404s an id that is not a profile, in the page and its metadata, without asking the relays', async () => {
    const note = nip19.noteEncode('1'.repeat(64));
    await expect(ProfileViewerPage({ params: params(note) })).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(generateMetadata({ params: params('garbage') })).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mocks.author).not.toHaveBeenCalled();
  });

  it('looks up the person an npub names', async () => {
    const pubkey = 'e'.repeat(64);
    await ProfileViewerPage({ params: params(nip19.npubEncode(pubkey)) });
    expect(mocks.author).toHaveBeenCalledWith(pubkey);
  });
});
