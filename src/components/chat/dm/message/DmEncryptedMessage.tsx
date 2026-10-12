'use client';

import { useTranslations } from 'next-intl';
import { LockIcon } from '@/assets/icons';
import Spinner from '@/components/ui/feedback/Spinner';
import Text from '@/components/ui/layout/Text';
import type { DmEncryptedMessage as EncryptedMessage } from '@/types/chat/dm-encrypted';

/** Unopened wire events never expose content or offer plaintext message actions. */
export function DmEncryptedMessage({ message }: { message: EncryptedMessage }) {
  const t = useTranslations();
  const opening = message.status === 'decrypting';
  return <div className={`my-2 flex ${message.outgoing ? 'justify-end' : 'justify-start'}`} data-testid="dm-encrypted-message">
    <div className="flex max-w-[85%] items-center gap-2 rounded-xl border border-lc-border bg-lc-dark px-4 py-3" aria-busy={opening}>
      {opening ? <Spinner size="sm" /> : <LockIcon size={16} />}
      <div>
        <Text as="p" size="sm" tone="muted">{opening ? t('dm.lock.decryptingMessage') : message.status === 'failed' ? t('dm.lock.failedMessage') : t('dm.lock.encryptedMessage')}</Text>
        {message.encryption === 'pq' && <Text as="p" size="11" tone="muted">{t('dm.lock.postQuantum')}</Text>}
      </div>
    </div>
  </div>;
}
