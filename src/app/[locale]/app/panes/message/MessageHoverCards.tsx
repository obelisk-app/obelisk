'use client';

import { displayNameFor } from '@/utils/identity/display-name';
import { useMemo } from 'react';
import { useUserMetadata as useProfile } from '@/services/nostr-bridge';
import { type MessageZapTotal } from '@/hooks/chat/zaps/useMessageZaps';
import { useTranslations } from 'next-intl';
import { useFormat } from '@/i18n/useFormat';

function PubkeyName({ pubkey }: { pubkey: string }) {
  const meta = useProfile(pubkey);
  return <>{displayNameFor(pubkey, meta)}</>;
}

function HoverCardShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      role="tooltip"
      className="pointer-events-none invisible absolute bottom-full left-0 z-30 mb-1 w-56 rounded-md border border-lc-border bg-lc-dark p-2 text-xs text-lc-white opacity-0 shadow-2xl transition-opacity group-hover/pill:visible group-hover/pill:opacity-100"
    >
      <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-lc-muted">
        {title}
      </div>
      {children}
    </div>
  );
}

export function ReactorHoverCard({
  emoji,
  pubkeys,
}: {
  emoji: string;
  pubkeys: ReadonlySet<string>;
}) {
  const t = useTranslations();
  const list = useMemo(() => Array.from(pubkeys), [pubkeys]);
  const shown = list.slice(0, 20);
  const extra = list.length - shown.length;
  return (
    <HoverCardShell title={`${emoji} ${t('shell.desktop.reactions.count', { count: list.length })}`}>
      <ul className="space-y-0.5">
        {shown.map((pk) => (
          <li key={pk} className="truncate">
            <PubkeyName pubkey={pk} />
          </li>
        ))}
        {extra > 0 && <li className="text-lc-muted">{t('shell.desktop.reactions.andMore', { count: String(extra) })}</li>}
      </ul>
    </HoverCardShell>
  );
}

export function ZapperHoverCard({ zapTotal }: { zapTotal: MessageZapTotal }) {
  const { formatNumber } = useFormat();
  const t = useTranslations();
  const entries = useMemo(
    () => Array.from(zapTotal.zapperAmounts.entries()).sort((a, b) => b[1] - a[1]),
    [zapTotal],
  );
  const shown = entries.slice(0, 20);
  const extra = entries.length - shown.length;
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
