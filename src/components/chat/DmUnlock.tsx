'use client';

import { useTranslations } from 'next-intl';
import Button from '@/components/ui/Button';
import { useDmUnlock } from '@/hooks/dm/useDmUnlock';

/**
 * Mounted on every DM surface (the lists, a thread, the compose screen).
 * Opening one is the person asking for their DMs, so this asks the bridge to
 * open the encrypted store; it shows nothing once they are open, a line
 * while the signer is asked, and a retry when the signer said no.
 */
export function DmUnlock({ className = '' }: { className?: string }) {
  const t = useTranslations();
  const { status, retry } = useDmUnlock();
  if (status === 'unlocking') {
    return (
      <div role="status" data-testid="dm-unlocking" className={`px-4 py-2 text-xs text-lc-white/80 ${className}`}>
        {t('dm.lock.unlocking')}
      </div>
    );
  }
  if (status !== 'failed') return null;
  return (
    <div role="alert" data-testid="dm-unlock-failed" className={`flex items-center gap-3 px-4 py-2 text-xs text-lc-white ${className}`}>
      <span className="min-w-0 flex-1">{t('dm.lock.failed')}</span>
      <Button variant="secondary" size="xs" onClick={retry} data-testid="dm-unlock-retry">
        {t('dm.lock.retry')}
      </Button>
    </div>
  );
}
