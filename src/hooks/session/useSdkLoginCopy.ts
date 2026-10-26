'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { watchSdkLoginCopy } from '@/services/session/sdk-login-copy';

/** Shows the `@nostr-wot/ui` login widget's own copy in the reader's language while the login modal is mounted. */
export function useSdkLoginCopy(): void {
  const t = useTranslations();
  useEffect(() => watchSdkLoginCopy(t), [t]);
}
