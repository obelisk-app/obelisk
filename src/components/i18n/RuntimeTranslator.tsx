'use client';

import { useRegisterTranslator } from '@/hooks/i18n/useRegisterTranslator';

/** Renders nothing; lends the tree's translator to non-React code. */
export default function RuntimeTranslator() {
  useRegisterTranslator();
  return null;
}
