'use client';

import { useTranslations } from 'next-intl';
import Text from '@/components/ui/layout/Text';
import Stack from '@/components/ui/layout/Stack';

/** Shared first paint while the viewport and its shell chunk become available. */
export function ShellLoading() {
  const t = useTranslations();
  return (
    <Stack role="status" aria-live="polite" align="center" gap="4" className="appearance-bg fixed inset-0 justify-center bg-lc-black p-4" data-testid="shell-loading">
      <div className="lc-spinner" aria-hidden="true" />
      <Text size="sm" tone="muted">{t('common.loading')}</Text>
    </Stack>
  );
}
