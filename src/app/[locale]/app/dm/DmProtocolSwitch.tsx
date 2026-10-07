'use client';

import SegmentedControl from '@/components/ui/forms/SegmentedControl';
import { useTranslations } from 'next-intl';
import type { DMProtocol } from '@/store/chat/dm';
import type { DmProtocolChoice } from '@/hooks/shell/dm/useDmProtocolChoice';

// The notice moved to its own file; re-exported so the DM headers keep
// importing both from here until their waves have merged.
export { DmProtocolNotice } from './DmProtocolNotice';

/**
 * The NIP-17 / NIP-04 switch. Both DM headers render it and the
 * `DmProtocolNotice` over one `useDmProtocolChoice`; where they sit is the
 * shell's business.
 */
export function DmProtocolSwitch({ choice, className }: { choice: DmProtocolChoice; className?: string }) {
  const t = useTranslations();
  return (
    <SegmentedControl<DMProtocol>
      aria-label={t('dm.protocol.label')}
      value={choice.protocol}
      onChange={choice.choose}
      className={className}
      options={[
        { value: 'nip17', label: 'NIP-17', title: t('dm.protocol.nip17Title'), testId: 'dm-protocol-nip17' },
        { value: 'nip04', label: 'NIP-04', title: t('dm.protocol.nip04Title'), testId: 'dm-protocol-nip04' },
      ]}
    />
  );
}
