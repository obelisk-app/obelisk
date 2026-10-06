/**
 * Translation for code that runs outside React: the DM call policy's
 * notices and the notification sound hint. They used to read
 * `document.documentElement.lang` and import every dictionary; now the app
 * shell registers its translator here (`useRegisterTranslator`) and they
 * borrow it. Before registration a key is returned as written, the same
 * fallback next-intl uses for a missing message.
 */

import type { TranslationValues } from 'next-intl';
import type { MessageKey, Translate } from './keys';

let current: Translate | null = null;

export function registerTranslator(t: Translate | null): void {
  current = t;
}

export function translate(key: MessageKey, values?: TranslationValues): string {
  return current ? current(key, values) : key;
}
