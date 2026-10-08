'use client';

import Stack from '@/components/ui/layout/Stack';
import { useTranslations } from 'next-intl';

export function LoadingThreads() {
  const t = useTranslations();
  return (
    <Stack
      gap="3" align="center" className="justify-center h-full text-center text-lc-muted py-12"
      data-testid="threads-loading"
    >
      <div className="lc-spinner" aria-hidden="true" />
      <div className="text-sm">{t('chat.forum.loading')}</div>
    </Stack>
  );
}
