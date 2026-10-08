import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { translator } from '@tests/support/intl';

const drawn: Array<{ element: ReactElement; size: unknown }> = [];
vi.mock('next/og', () => ({
  ImageResponse: class extends Response {
    constructor(element: ReactElement, init: { width: number; height: number }) {
      super('png');
      drawn.push({ element, size: { width: init.width, height: init.height } });
    }
  },
}));
const mocks = vi.hoisted(() => ({ event: vi.fn(), author: vi.fn() }));
vi.mock('@/services/server/viewer/nostr-fetch', async (orig) => ({
  ...(await orig<object>()),
  fetchEventForViewer: mocks.event,
  fetchAuthorForViewer: mocks.author,
}));

import { GET } from '@/app/[locale]/og/[kind]/[id]/route';

const NPUB = 'npub1sn0wdenkukak0d9dfczzeacvhkrgz92ak56egt7vdgzn8pv2wfqqhrjdv9';

async function card(locale: string, kind: string, id: string) {
  drawn.length = 0;
  const res = await GET(new Request('https://obelisk.ar/x'), { params: Promise.resolve({ locale, kind, id }) });
  return { res, html: drawn[0] ? renderToStaticMarkup(drawn[0].element) : '', size: drawn[0]?.size };
}

describe('the live-card route', () => {
  beforeEach(() => {
    mocks.event.mockResolvedValue(null);
    mocks.author.mockResolvedValue(null);
  });

  it('draws a hashtag card at 1200x630, in the URL language', async () => {
    const { res, html, size } = await card('es', 'tag', 'nostr');
    expect(res.status).toBe(200);
    expect(size).toEqual({ width: 1200, height: 630 });
    expect(html).toContain('#nostr');
    expect(html).toContain(translator('es')('seo.card.label.tag'));
    expect(html).toContain('obelisk.ar/es/t/nostr');
  });

  it('draws a profile card from the relays, and still draws one when they do not answer', async () => {
    mocks.author.mockResolvedValueOnce({ pubkey: 'x', name: 'Alice', about: 'Builds relays.' });
    expect((await card('en', 'profile', NPUB)).html).toContain('Builds relays.');
    expect((await card('pt', 'profile', NPUB)).html).toContain(translator('pt')('seo.profile.notFound'));
  });

  it('draws a note card that says the note was not found when the relays have none', async () => {
    const { html } = await card('en', 'note', 'note1notreal');
    expect(html).toContain(translator('en')('seo.notes.notFound'));
    expect(html).toContain('obelisk.ar/notes');
  });

  it('draws a branded relay with its logo, and any other relay with the generic card', async () => {
    const branded = await card('en', 'relay', 'lacrypta');
    expect(branded.html).toContain('La Crypta');
    expect(branded.html).toContain('data:image/png;base64,');
    const other = await card('es', 'relay', 'nonsense');
    expect(other.html).toContain(translator('es')('seo.relay.fallbackTitle'));
    expect(other.html).not.toContain('<img');
  });

  it('answers 404 for a kind it does not draw, the static pages included', async () => {
    for (const kind of ['landing', 'guides', 'nope']) {
      const { res } = await card('en', kind, 'x');
      expect(res.status, kind).toBe(404);
    }
    expect(drawn).toHaveLength(0);
  });
});
