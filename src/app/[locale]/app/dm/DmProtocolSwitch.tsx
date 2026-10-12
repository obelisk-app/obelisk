'use client';

import SegmentedControl from '@/components/ui/forms/SegmentedControl';
import { useTranslations } from 'next-intl';
import type { DmSendMode } from '@/store/chat/dm';
import type { DmProtocolChoice } from '@/hooks/shell/dm/useDmProtocolChoice';

/**
 * The NIP-17 / NIP-04 switch. Both DM headers render it and the
 * `DmProtocolNotice` over one `useDmProtocolChoice`; where they sit is the
 * shell's business.
 */
export function DmProtocolSwitch({ choice, className }: { choice: DmProtocolChoice; className?: string }) {
  const t = useTranslations();
  return (
    <SegmentedControl<DmSendMode>
      aria-label={t('dm.protocol.label')}
      value={choice.protocol}
      onChange={choice.choose}
      className={className}
      options={[
        { value: 'pq', label: t('dm.protocol.quantum'), title: t('dm.protocol.quantumTitle'), testId: 'dm-protocol-pq' },
        { value: 'nip17', label: t('dm.protocol.secured'), title: t('dm.protocol.nip17Title'), testId: 'dm-protocol-nip17' },
        { value: 'nip04', label: t('dm.protocol.legacy'), title: t('dm.protocol.nip04Title'), testId: 'dm-protocol-nip04' },
      ]}
    />
  );
}
