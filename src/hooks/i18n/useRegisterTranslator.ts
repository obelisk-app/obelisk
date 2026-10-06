'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { registerTranslator } from '@/i18n/runtime';

/** Lends this tree's translator to non-React code (`@/i18n/runtime`). */
export function useRegisterTranslator(): void {
  const t = useTranslations();
  useEffect(() => {
    registerTranslator(t);
    return () => registerTranslator(null);
  }, [t]);
}
