'use client';

import { useSignerReady } from '@/hooks/session/useSession';
import { useTranslations } from 'next-intl';
import TextButton from '@/components/ui/buttons/TextButton';

export function EmptyForum({ onNewThread }: { onNewThread: () => void }) {
  const t = useTranslations();
  const ready = useSignerReady();
  return (
    <div className="flex flex-col items-center justify-center h-full text-center text-lc-muted py-12">
      <div className="text-sm">{t('chat.forum.emptyDesktop')}</div>
      {ready && (
        <TextButton
          onClick={onNewThread} className="mt-3 text-sm font-medium"
        >
          {t('chat.forum.startFirst')}
        </TextButton>
      )}
    </div>
  );
}
