'use client';

import Button from '@/components/ui/buttons/Button';
import { cn } from '@/utils/style/cn';
import { useTranslations } from 'next-intl';
import type { DmProtocolChoice } from '@/hooks/shell/dm/useDmProtocolChoice';

/** The one-line NIP-04 explanation shown before a thread switches to NIP-04, with keep and confirm. */
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
