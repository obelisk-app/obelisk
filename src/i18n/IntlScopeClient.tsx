'use client';

import { useMemo, type ReactNode } from 'react';
import { NextIntlClientProvider, useMessages, useLocale } from 'next-intl';
import type { AbstractIntlMessages } from 'next-intl';

/** Route additions inherit common messages already delivered by the root provider. */
export default function IntlScopeClient({ messages, children }: { messages: AbstractIntlMessages; children: ReactNode }) {
  const locale = useLocale();
  const inherited = useMessages();
  const merged = useMemo(() => ({ common: inherited.common, ...messages }), [inherited.common, messages]);
  return <NextIntlClientProvider locale={locale} messages={merged}>{children}</NextIntlClientProvider>;
}
