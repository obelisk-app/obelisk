/**
 * The table of the login widget's English copy stays true to the widget that
 * is installed: every string it rewrites still occurs in the SDK's sources
 * (so an SDK update that rewords one fails here, not silently in Spanish),
 * and every replacement is a message in all three languages with no em dash.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SDK_LOGIN_COPY } from '@/constants/session/sdk-login-copy';
import { LOCALES } from '@/i18n';
import { flatMessages } from '@tests/support/messages';

const normalize = (text: string) => text.replace(/\s+/g, ' ');

function sdkSources(): string {
  const entry = createRequire(import.meta.url).resolve('@nostr-wot/ui');
  const map = JSON.parse(readFileSync(join(dirname(entry), 'index.js.map'), 'utf8')) as { sourcesContent: string[] };
  return normalize(map.sourcesContent.join('\n'));
}

describe('SDK_LOGIN_COPY', () => {
  it('matches copy the installed @nostr-wot/ui widget really renders', () => {
    const sources = sdkSources();
    const missing = Object.keys(SDK_LOGIN_COPY).filter((english) => !sources.includes(english));
    expect(missing).toEqual([]);
  });

  it.each(LOCALES)('every replacement exists in %s and has no em dash', (locale) => {
    const messages = flatMessages(locale);
    for (const key of new Set(Object.values(SDK_LOGIN_COPY))) {
      expect(messages[key], key).toBeTruthy();
      expect(messages[key], key).not.toContain('\u2014');
    }
  });
});
