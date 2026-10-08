/**
 * Every message module of one language, read from disk the way the server
 * loads them, for the scripts that render copy outside Next.js
 * (`snap-guides`, `snap-og`), and a translator over them.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTranslator } from 'next-intl';
import type { Locale } from '@/i18n';
import type { Translate } from '@/i18n/keys';
import { MODULES } from '@/i18n/modules';

const MESSAGES_DIR = join(process.cwd(), 'src', 'i18n', 'messages');

export function messagesFor(locale: Locale): Record<string, unknown> {
  return Object.fromEntries(
    MODULES.map((m) => [m, JSON.parse(readFileSync(join(MESSAGES_DIR, locale, `${m}.json`), 'utf8'))]),
  );
}

/** A plain `t` for one language; a missing key throws rather than printing the key into a file. */
export function translatorFor(locale: Locale): Translate {
  const fail = (error: Error) => {
    throw error;
  };
  return createTranslator({ locale, messages: messagesFor(locale), onError: fail }) as unknown as Translate;
}
