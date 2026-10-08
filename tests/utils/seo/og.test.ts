import { describe, expect, it } from 'vitest';
import { translator } from '@tests/support/intl';
import { isLiveKind, ogCardPath, ogImage, staticCardFile } from '@/utils/seo/og';
import { cardFooter, pageCardProps } from '@/utils/seo/cards';
import { OG_CARD_VERSIONS } from '@/constants/seo/og';

describe('a static page names its card file', () => {
  it('under /og/cards/<locale>/, after the page path; the landing page is home', () => {
    expect(staticCardFile('en', { page: 'landing' })).toBe('/og/cards/en/home.png');
    expect(staticCardFile('es', { page: 'helpLocalData' })).toBe('/og/cards/es/help/local-data.png');
    expect(staticCardFile('pt', { page: 'mediaKit' })).toBe('/og/cards/pt/media-kit.png');
    expect(staticCardFile('es', { guide: 'vesta' })).toBe('/og/cards/es/guides/vesta.png');
  });
});

describe('a live page names the one live-card route', () => {
  it('at its public address in the page language, the id escaped', () => {
    expect(ogCardPath('en', { live: 'note', id: 'note1abc' })).toBe('/og/note/note1abc');
    expect(ogCardPath('es', { live: 'tag', id: 'café y más' })).toBe('/es/og/tag/caf%C3%A9%20y%20m%C3%A1s');
    expect(ogCardPath('pt', { live: 'relay', id: 'lacrypta' })).toBe('/pt/og/relay/lacrypta');
  });

  it('knows its kinds', () => {
    for (const kind of ['note', 'profile', 'tag', 'relay']) expect(isLiveKind(kind)).toBe(true);
    expect(isLiveKind('landing')).toBe(false);
  });
});

describe('ogImage', () => {
  it('is the full image entry: absolute URL, 1200x630, PNG, translated alt', () => {
    const t = translator('es');
    expect(ogImage(t, 'es', { page: 'help' }, 'Ayuda · Obelisk')).toEqual({
      url: `https://obelisk.ar/og/cards/es/help.png?v=${OG_CARD_VERSIONS['/og/cards/es/help.png']}`,
      width: 1200,
      height: 630,
      type: 'image/png',
      alt: t('seo.card.alt', { title: 'Ayuda · Obelisk' }),
    });
    expect(ogImage(t, 'en', { live: 'profile', id: 'npub1x' }, 'x').url).toBe('https://obelisk.ar/og/profile/npub1x');
  });
});

describe('a site page card', () => {
  it('reads its label, title and description from seo, and its address as the footer', () => {
    const t = translator('pt');
    expect(pageCardProps(t, 'pt', 'features')).toEqual({
      label: t('seo.card.label.features'),
      title: t('seo.features.title'),
      subtitle: t('seo.features.description'),
      footer: 'obelisk.ar/pt/features',
      icon: 'features',
    });
    expect(cardFooter('en', '/')).toBe('obelisk.ar');
  });
});
