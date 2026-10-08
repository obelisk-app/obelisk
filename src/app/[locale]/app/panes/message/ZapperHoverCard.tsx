'use client';

import List from '@/components/ui/layout/List';
import { type MessageZapTotal } from '@/hooks/chat/zaps/useMessageZaps';
import { useTranslations } from 'next-intl';
import { useFormat } from '@/i18n/useFormat';
import { useZapperHoverCard } from '@/hooks/shell/panes/message/useZapperHoverCard';
import { HoverCardShell } from './HoverCardShell';
import UserName from '@/components/identity/UserName';

/** Who zapped a message and how much, largest first: the first 20, then "and N more". */
export function ZapperHoverCard({ zapTotal }: { zapTotal: MessageZapTotal }) {
  const { formatNumber } = useFormat();
  const t = useTranslations();
  const { shown, extra } = useZapperHoverCard(zapTotal);
  return (
    <HoverCardShell
      title={`⚡ ${t('shell.desktop.zaps.sats', { amount: formatNumber(zapTotal.totalSats) })} · ${t('shell.desktop.zaps.count', { count: zapTotal.count })}`}
    >
      <List marker="none" spacing="none" className="space-y-0.5">
        {shown.map(([pk, sats]) => (
          <li key={pk} className="flex items-center justify-between gap-2 truncate">
            <span className="truncate"><UserName pubkey={pk} /></span>
            <span className="shrink-0 text-yellow-300">{formatNumber(sats)}</span>
          </li>
        ))}
        {extra > 0 && <li className="text-lc-muted">{t('shell.desktop.reactions.andMore', { count: String(extra) })}</li>}
      </List>
    </HoverCardShell>
  );
}
