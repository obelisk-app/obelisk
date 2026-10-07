'use client';

import { type MessageZapTotal } from '@/hooks/chat/zaps/useMessageZaps';
import { useTranslations } from 'next-intl';
import { useFormat } from '@/i18n/useFormat';
import { useZapperHoverCard } from '@/hooks/shell/panes/message/useZapperHoverCard';
import { HoverCardShell } from './HoverCardShell';
import { PubkeyName } from './PubkeyName';

/** Who zapped a message and how much, largest first: the first 20, then "and N more". */
export function ZapperHoverCard({ zapTotal }: { zapTotal: MessageZapTotal }) {
  const { formatNumber } = useFormat();
  const t = useTranslations();
  const { shown, extra } = useZapperHoverCard(zapTotal);
  return (
    <HoverCardShell
      title={`⚡ ${t('shell.desktop.zaps.sats', { amount: formatNumber(zapTotal.totalSats) })} · ${t('shell.desktop.zaps.count', { count: zapTotal.count })}`}
    >
      <ul className="space-y-0.5">
        {shown.map(([pk, sats]) => (
          <li key={pk} className="flex items-center justify-between gap-2 truncate">
            <span className="truncate"><PubkeyName pubkey={pk} /></span>
            <span className="shrink-0 text-yellow-300">{formatNumber(sats)}</span>
          </li>
        ))}
        {extra > 0 && <li className="text-lc-muted">{t('shell.desktop.reactions.andMore', { count: String(extra) })}</li>}
      </ul>
    </HoverCardShell>
  );
}
