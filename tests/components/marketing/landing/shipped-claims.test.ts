import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { LOCALES } from '@/i18n';
import { translator } from '@tests/support/intl';
import { ROADMAP_PHASES } from '@/constants/marketing/landing';

/**
 * Voice rooms, NIP-46 signer login and the installable app ship, so the
 * FAQ and the Learn card must not call them coming. These read the claims
 * against the code they describe, so a removal on either side shows up here.
 */
const SHIPS = {
  voice: 'src/services/voice/client.ts',
  bunker: 'src/services/nostr-bridge/session/bunker-login.ts',
  manifest: 'src/app/manifest.ts',
  serviceWorker: 'public/sw.js',
};

describe('copy about shipped features', () => {
  it('describes features whose code exists', () => {
    for (const [name, path] of Object.entries(SHIPS)) {
      expect(existsSync(join(process.cwd(), path)), name).toBe(true);
    }
  });

  it.each(LOCALES)('%s: the FAQ and Learn card say voice, NIP-46 and the PWA are here', (locale) => {
    const t = translator(locale);
    const shipped = [
      t('marketing.faq.q4.answer'),
      t('marketing.faq.q9.answer'),
      t('marketing.faq.q10.answer'),
      t('marketing.learn.card.futureNostrRelays.desc'),
    ].join('\n');
    expect(shipped).not.toMatch(/roadmap|once shipped|cuando esté|quando sair/i);
    expect(t('marketing.faq.q4.answer')).toContain('NIP-46');
    expect(t('marketing.faq.q10.answer')).toContain('PWA');
    expect(t('marketing.faq.q9.answer')).toContain('WebRTC');
  });

  it.each(LOCALES)('%s: no copy promises a static host or a ban button the app does not have', (locale) => {
    const t = translator(locale);
    const copy = [
      t('marketing.features.spamResistant.desc'),
      t('marketing.features.realtimeChat.desc'),
      t('marketing.faq.q5.answer'),
      t('showcase.desktop.shot3.features'),
      t('showcase.mobile.shot2.features'),
    ].join('\n');
    expect(copy).not.toMatch(/static host|host estático|\bbans?\b|baneos|banimentos|hardware|~6/i);
  });

  it('marks the static export and Web Push as upcoming, not done', () => {
    const upcoming = ROADMAP_PHASES.filter((p) => p.status !== 'done').map((p) => p.key);
    expect(upcoming).toEqual(['phase7']);
    const t = translator('en');
    for (const p of ROADMAP_PHASES.filter((phase) => phase.status === 'done')) {
      expect(t(`marketing.roadmap.${p.key}.items`)).not.toMatch(/static-export|push notifications/i);
    }
  });
});
