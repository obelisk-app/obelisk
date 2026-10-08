'use client';

import Button from '@/components/ui/buttons/Button';
import { useTranslations } from 'next-intl';

/** Gift wraps that came in while DMs are locked: their sender is still encrypted, so one row for all. */
export function LockedDmsCard({ count, onJump }: { count: number; onJump: () => void }) {
  const t = useTranslations();
  return (
    <Button variant="bare" className="mention-card" onClick={onJump} data-testid="inbox-dm-locked">
      <div className="mc-context">
        <span className="notif-type dm">{t('shell.inbox.locked.count', { count })}</span>
      </div>
      <div className="mc-text" style={{ marginTop: 6, color: 'var(--app-text-dim)' }}>{t('shell.inbox.locked.hint')}</div>
    </Button>
  );
}
