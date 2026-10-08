'use client';

import List from '@/components/ui/layout/List';
import { useTranslations } from 'next-intl';
import { useReactorHoverCard } from '@/hooks/shell/panes/message/useReactorHoverCard';
import { HoverCardShell } from './HoverCardShell';
import UserName from '@/components/identity/UserName';

/** Who reacted with one emoji: the first 20 names, then "and N more". */
export function ReactorHoverCard({
  emoji,
  pubkeys,
}: {
  emoji: string;
  pubkeys: ReadonlySet<string>;
}) {
  const t = useTranslations();
  const { shown, extra, total } = useReactorHoverCard(pubkeys);
  return (
    <HoverCardShell title={`${emoji} ${t('shell.desktop.reactions.count', { count: total })}`}>
      <List marker="none" spacing="none" className="space-y-0.5">
        {shown.map((pk) => (
          <li key={pk} className="truncate">
            <UserName pubkey={pk} />
          </li>
        ))}
        {extra > 0 && <li className="text-lc-muted">{t('shell.desktop.reactions.andMore', { count: String(extra) })}</li>}
      </List>
    </HoverCardShell>
  );
}
