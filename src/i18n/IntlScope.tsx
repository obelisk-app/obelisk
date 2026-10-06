/**
 * The client half of a route's copy: a `NextIntlClientProvider` carrying
 * only the modules in `SCOPES[scope]`, in the request's one language.
 * Server components read every module through `getTranslations` and need
 * nothing from here.
 */

import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { SCOPES, pickModules, type Scope } from './modules';

export default async function IntlScope({ scope, children }: { scope: Scope; children: ReactNode }) {
  const messages = await getMessages();
  return (
    <NextIntlClientProvider messages={pickModules(messages, SCOPES[scope])}>
      {children}
    </NextIntlClientProvider>
  );
}
