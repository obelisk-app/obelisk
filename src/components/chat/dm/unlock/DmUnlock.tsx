'use client';

import { useTranslations } from 'next-intl';
import { shortNpubLabel } from '@/utils/identity/short-npub';
import Text from '@/components/ui/layout/Text';
import Button from '@/components/ui/buttons/Button';
import { useDmUnlock } from '@/hooks/chat/dm/unlock/useDmUnlock';

/**
 * Mounted on every DM surface (the lists, a thread, the compose screen).
 * Opening one is the person asking for their DMs, so this asks the bridge to
 * open the encrypted store; it shows nothing once they are open, a line
 * while the signer is asked, and a retry when the signer said no.
 */
export function DmUnlock({ className = '', peer }: { className?: string; peer?: string }) {
  const t = useTranslations();
  const { status, pendingDecryptions, failedDecryptions, failures, unopened, enabled, retry, discover } = useDmUnlock(peer);
  if (!enabled) return null;
  if (status === 'unlocking' || pendingDecryptions > 0) {
    return (
      <div role="status" data-testid="dm-unlocking" className={`px-4 py-2 text-xs text-lc-white/80 ${className}`}>
        {pendingDecryptions > 0 ? t(peer ? 'dm.lock.conversationLoading' : 'dm.lock.loading', { count: pendingDecryptions }) : t('dm.lock.unlocking')}
      </div>
    );
  }
  if (!failedDecryptions && ((!peer && status === 'locked') || (status === 'unlocked' && unopened > 0))) {
    return <div className={`px-4 py-2 ${className}`}>
      <Button variant="secondary" size="xs" onClick={discover} data-testid="dm-discover">{t('dm.lock.discover')}</Button>
    </div>;
  }
  if (status !== 'failed' && !failedDecryptions) return null;
  return (
    <div role="alert" data-testid="dm-unlock-failed" className={`flex items-center gap-3 px-4 py-2 text-xs text-lc-white ${className}`}>
      <div className="min-w-0 flex-1">
        <Text as="p">{failedDecryptions ? t('dm.lock.messagesFailed', { count: failedDecryptions }) : t('dm.lock.failed')}</Text>
        {!peer && failures.map((message) => <div key={message.id} className="mt-2 break-all">
          <Text as="p">{message.counterparty ? shortNpubLabel(message.counterparty) : t('dm.lock.unknownSender')} · {message.encryption === 'pq' ? t('dm.protocol.quantum') : message.encryption === 'nip04' ? t('dm.protocol.legacy') : message.encryption === 'nip44' ? t('dm.protocol.secured') : t('dm.lock.encryptedMessage')}</Text>
          <Text as="p" className="font-mono text-[10px]">{message.id.slice(0, 12)}</Text>
          {!message.counterparty && <Text as="p">{t('dm.lock.unknownHint')}</Text>}
        </div>)}
      </div>
      <Button variant="secondary" size="xs" onClick={retry} data-testid="dm-unlock-retry">
        {t('dm.lock.retry')}
      </Button>
    </div>
  );
}
