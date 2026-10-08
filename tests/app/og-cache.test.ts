import { describe, expect, it, vi } from 'vitest';
import { getPathMatch } from 'next/dist/shared/lib/router/utils/path-match';

vi.mock('next/og', () => ({
  ImageResponse: class extends Response {
    constructor(_element: unknown, init: { headers?: Record<string, string> }) {
      super('png', { headers: { 'cache-control': 'renderer default', ...init.headers } });
    }
  },
}));
const mocks = vi.hoisted(() => ({ event: vi.fn(), author: vi.fn() }));
vi.mock('@/services/server/viewer/nostr-fetch', async (orig) => ({
  ...(await orig<object>()),
  fetchEventForViewer: mocks.event,
  fetchAuthorForViewer: mocks.author,
}));

import nextConfig from '../../next.config';
import { GET } from '@/app/[locale]/og/[kind]/[id]/route';
import { ogImage } from '@/utils/seo/og';
import { translator } from '@tests/support/intl';
import { OG_CARD_VERSIONS } from '@/constants/seo/og';

/**
 * How long a preview card may be kept, written out so a change is a
 * decision. A static card's URL carries its version (`?v=`, `npm run
 * snap-og`), so it is kept for good. A live card (note, profile, hashtag,
 * relay share link) shows names, pictures and text that change: an hour in
 * a browser or a preview bot, a day on the CDN, up to a week stale while it
 * refreshes; a card drawn without the relays' answer only a minute.
 */
const STATIC = 'public, max-age=31536000, immutable';
const LIVE = 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800';
const LIVE_MISS = 'public, max-age=60, s-maxage=60';
const NPUB = 'npub1sn0wdenkukak0d9dfczzeacvhkrgz92ak56egt7vdgzn8pv2wfqqhrjdv9';

/** The Cache-Control next.config.ts sets for a path: the last matching rule wins, as in Next. */
async function configCache(path: string): Promise<string | undefined> {
  let value: string | undefined;
  for (const rule of await nextConfig.headers!()) {
    if (!getPathMatch(rule.source, { strict: true, removeUnnamedParams: true })(path)) continue;
    const header = rule.headers.find((h) => h.key.toLowerCase() === 'cache-control');
    if (header) value = header.value;
  }
  return value;
}

async function liveCache(locale: string, kind: string, id: string): Promise<string | null> {
  const res = await GET(new Request('https://obelisk.ar/x'), { params: Promise.resolve({ locale, kind, id }) });
  return res.headers.get('cache-control');
}

describe('static preview cards', () => {
  it('are kept for good: next.config.ts marks every file under /og/cards immutable', async () => {
    for (const path of ['/og/cards/en/home.png', '/og/cards/es/help/local-data.png', '/og/cards/pt/guides/vesta.png']) {
      expect(await configCache(path), path).toBe(STATIC);
    }
  });

  it('which is safe because each URL carries the card\'s version', () => {
    const { url } = ogImage(translator('es'), 'es', { guide: 'vesta' }, 'x');
    const version = OG_CARD_VERSIONS['/og/cards/es/guides/vesta.png'];
    expect(version).toMatch(/^[0-9a-f]{16}$/);
    expect(url).toBe(`https://obelisk.ar/og/cards/es/guides/vesta.png?v=${version}`);
  });
});

describe('live preview cards', () => {
  it('get no Cache-Control from next.config.ts, so the route\'s own reaches the client', async () => {
    for (const path of ['/og/note/note1x', '/es/og/tag/nostr', '/pt/og/relay/lacrypta', `/og/profile/${NPUB}`]) {
      expect(await configCache(path), path).toBeUndefined();
    }
    // Pages keep revalidating on every navigation.
    expect(await configCache('/features')).toBe('no-cache, must-revalidate');
    expect(await configCache('/es/app')).toBe('no-cache, must-revalidate');
  });

  it('are kept an hour, a day on the CDN, when they show what the relays returned', async () => {
    mocks.author.mockResolvedValue({ pubkey: 'x', name: 'Alice', displayName: null, about: null, picture: null });
    expect(await liveCache('en', 'profile', NPUB)).toBe(LIVE);
    expect(await liveCache('es', 'tag', 'nostr')).toBe(LIVE);
    expect(await liveCache('en', 'relay', 'lacrypta')).toBe(LIVE);
    expect(await liveCache('en', 'relay', 'nonsense')).toBe(LIVE);
  });

  it('are kept a minute when drawn without the relays\' answer', async () => {
    mocks.event.mockResolvedValue(null);
    mocks.author.mockResolvedValue({ pubkey: 'x', name: null, displayName: null, about: null, picture: null });
    expect(await liveCache('en', 'note', 'note1notreal')).toBe(LIVE_MISS);
    expect(await liveCache('pt', 'profile', NPUB)).toBe(LIVE_MISS);
  });
});
