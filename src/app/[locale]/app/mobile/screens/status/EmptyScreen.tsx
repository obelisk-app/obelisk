'use client';

import Button from '@/components/ui/buttons/Button';
import { useTranslations } from 'next-intl';
import type { ScreenName } from '@/utils/shell/mobile/url-state';

/** A sub-screen whose target is missing (no channel, no peer): one way home. */
export function EmptyScreen({ go, title }: { go: (s: ScreenName) => void; title: string }) {
  const t = useTranslations();
  return (
    <div className="screen active">
      <div className="empty-state">
        <div className="empty-state-title">{title}</div>
        <Button variant="mobilePrimary" style={{ width: 'auto', padding: '10px 18px' }} onClick={() => go('server')}>
          {t('mobile.empty.backHome')}
        </Button>
      </div>
    </div>
  );
}
