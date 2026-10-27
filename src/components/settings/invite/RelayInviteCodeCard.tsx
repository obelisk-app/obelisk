'use client';

import Card from '@/components/ui/layout/Card';
import { useTranslations } from 'next-intl';
import Button from '@/components/ui/buttons/Button';
import Text from '@/components/ui/layout/Text';
import { useFormat } from '@/hooks/common/useFormat';
import type { RelayInviteCode } from '@/services/relay/relay-invite-api';
import List from '@/components/ui/layout/List';
import RelayInviteJoinedPerson from './RelayInviteJoinedPerson';

interface Props {
  invite: RelayInviteCode;
  link: string;
  /** The Copy button just worked. */
  copied: boolean;
  /** How full the link is, 0-100; null when it has no limit. */
  usedPercent: number | null;
  /** Whole days until it expires; null when it never does. */
  daysLeft: number | null;
  /** Who came in on it, newest first. */
  joined: { pubkey: string; at: number }[];
  busy: boolean;
  onCopy: () => void;
  onRevoke: () => void;
}

const STATUS_TONE: Record<RelayInviteCode['status'], string> = {
  active: 'bg-lc-green/15 text-lc-green',
  exhausted: 'bg-lc-border/60 text-lc-muted',
  expired: 'bg-lc-border/60 text-lc-muted',
  revoked: 'bg-red-500/15 text-red-300',
};

/** One invite link: its state, the link to share, how full it is, when it ends and who joined on it. */
export default function RelayInviteCodeCard({ invite, link, copied, usedPercent, daysLeft, joined, busy, onCopy, onRevoke }: Props) {
  const t = useTranslations();
  const { formatDate } = useFormat();
  const active = invite.status === 'active';

  return (
    <Card surface="subtle" radius="lg" className="space-y-3" data-testid="relay-invite-code">
      <div className="flex items-center justify-between gap-2">
        <Text as="span" size="sm" weight="semibold" tone="default" className="truncate">{invite.label ?? t('settings.invites.linkTitle')}</Text>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE[invite.status]}`}>
          {t(`settings.invites.status.${invite.status}`)}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Text as="span" size="xs" tone={active ? 'default' : 'muted'} className="min-w-0 flex-1 truncate rounded-md border border-lc-border bg-lc-black/40 px-2 py-1.5 font-mono" title={link}>{link}</Text>
        {active && (
          <Button variant={copied ? 'primary' : 'outlinePill'} size="xs" onClick={onCopy} data-testid="relay-invite-copy" aria-live="polite">
            {copied ? t('settings.invites.copiedShort') : t('settings.invites.copy')}
          </Button>
        )}
      </div>

      <div className="space-y-1">
        <div className="flex items-baseline justify-between gap-2">
          <Text as="span" size="xs" tone="default">
            {invite.max_uses == null
              ? t('settings.invites.peopleUnlimited', { uses: invite.uses })
              : t('settings.invites.people', { uses: invite.uses, max: invite.max_uses })}
          </Text>
          {invite.expires_at != null && active && daysLeft != null && (
            <Text as="span" size="xs" tone="muted">
              {t('settings.invites.expiresIn', { days: daysLeft, date: formatDate(invite.expires_at * 1000) })}
            </Text>
          )}
        </div>
        {usedPercent != null && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-lc-border/50" role="progressbar" aria-valuenow={usedPercent} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-lc-green" style={{ width: `${usedPercent}%` }} />
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Text as="p" size="xs" weight="semibold" tone="muted">{t('settings.invites.joinedTitle', { count: joined.length })}</Text>
        {joined.length === 0 ? (
          <Text as="p" size="xs" tone="muted">{t('settings.invites.nobodyYet')}</Text>
        ) : (
          <List marker="none" spacing="tight">
            {joined.map((p) => <RelayInviteJoinedPerson key={p.pubkey} pubkey={p.pubkey} at={p.at} />)}
          </List>
        )}
      </div>

      {active && (
        <Button variant="outlinePill" tone="danger" size="xs" onClick={onRevoke} disabled={busy} data-testid="relay-invite-revoke">
          {t('settings.invites.revoke')}
        </Button>
      )}
    </Card>
  );
}
