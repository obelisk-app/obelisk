import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider, useLocale, useMessages, useTranslations } from 'next-intl';
import { describe, expect, it } from 'vitest';
import IntlScopeClient from '@/i18n/IntlScopeClient';
import { scopeMessages } from '@/i18n/modules';

function Probe() {
  const t = useTranslations();
  const locale = useLocale();
  const messages = useMessages();
  return <output data-testid="copy">{locale}:{t('common.close')}:{t('marketing.nav.features')}:{Object.keys(messages).sort().join(',')}</output>;
}

describe('route message inheritance', () => {
  it('inherits common copy and locale, replacing route additions on navigation', () => {
    const view = (locale: 'en' | 'es', close: string, features: string, extra = {}) => (
      <NextIntlClientProvider locale={locale} timeZone="UTC" messages={{ common: { close }, help: { title: 'old' } }}>
        <IntlScopeClient messages={{ marketing: { nav: { features } }, ...extra }}><Probe /></IntlScopeClient>
      </NextIntlClientProvider>
    );
    const { rerender } = render(view('en', 'OK', 'Home', { guides: { clip: { play: 'Play' } } }));
    expect(screen.getByTestId('copy')).toHaveTextContent('en:OK:Home:common,guides,marketing');
    rerender(view('es', 'Vale', 'Inicio'));
    expect(screen.getByTestId('copy')).toHaveTextContent('es:Vale:Inicio:common,marketing');
  });

  it('adds only clip controls under the shared site navigation scope', () => {
    const messages = {
      common: { close: 'OK' },
      marketing: { nav: { home: 'Home' }, learn: { card: { title: 'Guide' }, body: 'Server copy' }, footer: { about: 'About' }, hero: 'Server copy' },
      guides: { clip: { play: 'Play' }, article: 'Server copy' }, help: { body: 'Server copy' },
    };
    const before = JSON.stringify(messages);
    expect(scopeMessages(messages, 'guides', true)).toEqual({
      guides: { clip: messages.guides.clip },
    });
    expect(scopeMessages(messages, 'public')).toHaveProperty('common.close', 'OK');
    expect(JSON.stringify(messages)).toBe(before);
  });
});
