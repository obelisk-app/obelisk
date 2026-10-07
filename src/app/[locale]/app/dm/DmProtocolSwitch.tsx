'use client';

import Button from '@/components/ui/buttons/Button';
import SegmentedControl from '@/components/ui/forms/SegmentedControl';
import { cn } from '@/utils/style/cn';
import { useTranslations } from 'next-intl';
import type { DMProtocol } from '@/store/chat/dm';
import type { DmProtocolChoice } from '@/hooks/shell/dm/useDmProtocolChoice';

/**
 * The NIP-17 / NIP-04 switch and its one-line NIP-04 explanation. Both DM
 * headers render these two over one `useDmProtocolChoice`; where they sit is
 * the shell's business.
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

export function DmProtocolNotice({ choice, className }: { choice: DmProtocolChoice; className?: string }) {
  const t = useTranslations();
  if (!choice.confirming) return null;
  return (
    <div
      role="alert"
      className={cn('flex flex-wrap items-center gap-2 border-b border-lc-border bg-lc-card/60 px-5 py-2 text-xs text-lc-white', className)}
      data-testid="dm-protocol-notice"
    >
      <span className="min-w-0 flex-1">{t('dm.protocol.nip04Explain')}</span>
      <Button variant="ghost" size="xs" onClick={choice.cancel} data-testid="dm-protocol-keep">
        {t('dm.protocol.keepNip17')}
      </Button>
      <Button variant="outlinePill" size="xs" onClick={choice.confirmNip04} data-testid="dm-protocol-confirm">
        {t('dm.protocol.useNip04')}
      </Button>
    </div>
  );
}
