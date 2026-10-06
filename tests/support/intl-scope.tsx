import type { ReactNode } from 'react';
import { LocaleProvider } from './intl';
import { currentRequestLocale } from './next-intl-server';

/**
 * `@/i18n/IntlScope` for vitest: the real one is an async server component
 * (it awaits `getMessages`), which a client `render()` cannot mount. This
 * one is synchronous and provides every module in the request's locale, so
 * a page test can render `await Page({ params })` as it did before.
 * `tests/i18n/route-scopes.test.ts` checks the real scopes statically.
 */
export default function IntlScope({ children }: { scope: string; children: ReactNode }) {
  return <LocaleProvider initialLocale={currentRequestLocale()}>{children}</LocaleProvider>;
}
