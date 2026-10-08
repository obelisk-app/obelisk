/**
 * The client half of a route's copy: a `NextIntlClientProvider` carrying
 * only selected client copy, in the request's one language. Route layouts
 * own scopes; nested providers inherit root common copy in the browser.
 * Server components read every module through `getTranslations` and need
 * nothing from here.
 */

import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { scopeMessages, type Scope } from './modules';
import IntlScopeClient from './IntlScopeClient';

export default async function IntlScope({ scope, children, standalone = false }: { scope: Scope; children: ReactNode; standalone?: boolean }) {
  const messages = await getMessages();
  const inheritCommon = scope !== 'common' && !standalone;
  const selected = scopeMessages(messages, scope, inheritCommon);
  if (inheritCommon) return <IntlScopeClient messages={selected}>{children}</IntlScopeClient>;
  return (
    <NextIntlClientProvider messages={selected}>
      {children}
    </NextIntlClientProvider>
  );
}
