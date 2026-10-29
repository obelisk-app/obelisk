'use client';

import Card from '@/components/ui/layout/Card';
import { useTranslations } from 'next-intl';
import Button from '@/components/ui/buttons/Button';
import Text from '@/components/ui/layout/Text';
import List from '@/components/ui/layout/List';
import ErrorState from '@/components/ui/feedback/ErrorState';
import { useFormat } from '@/hooks/common/useFormat';
import { useRelayInviteCodeCard } from '@/hooks/settings/invite/useRelayInviteCodeCard';
import type { RelayInviteCode } from '@/types/relay/relay-invite';
import RelayInviteJoinedPerson from './RelayInviteJoinedPerson';
import { CopyIcon, ShareIcon } from '@/assets/icons';

interface Props {
  relay: string;
  relayName: string;
  invite: RelayInviteCode;
  link: string;
  /** When the answer was read, for the days left. */
  at: number;
  /** A link was turned off: read the list again. */
  onChanged: () => void;
}

const STATUS_TONE: Record<RelayInviteCode['status'], string> = {
  active: 'bg-lc-green/15 text-lc-green',
  exhausted: 'bg-lc-border/60 text-lc-muted',
  expired: 'bg-lc-border/60 text-lc-muted',
  revoked: 'bg-red-500/15 text-red-300',
};

/** One invite link: its label and state, the link with Copy and Share, uses, expiry, who joined, and Turn off. */
export default function RelayInviteCodeCard({ relay, relayName, invite, link, at, onChanged }: Props) {
  const t = useTranslations();
  const { formatDate } = useFormat();
  const vm = useRelayInviteCodeCard({ relay, relayName, invite, link, at, onChanged });

  return (
    <Card surface="subtle" radius="lg" className="space-y-3" data-testid="relay-invite-code">
      <div className="flex items-center justify-between gap-2">
        <Text as="span" size="sm" weight="semibold" tone="default" className="truncate">{invite.label ?? t('settings.invites.linkTitle')}</Text>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE[invite.status]}`}>
          {t(`settings.invites.status.${invite.status}`)}
        </span>
      </div>

      <Text as="span" size="xs" tone={vm.active ? 'default' : 'muted'} className="block truncate rounded-md border border-lc-border bg-lc-black/40 px-2 py-1.5 font-mono" title={link}>{link}</Text>
      {vm.active && (
        <div className="flex flex-wrap gap-2">
          <Button variant={vm.copied ? 'primary' : 'outlinePill'} size="xs" onClick={vm.copy} data-testid="relay-invite-copy" aria-live="polite">
            <CopyIcon size={12} />
            {vm.copied ? t('settings.invites.copiedShort') : t('settings.invites.copy')}
          </Button>
          {vm.canShare && (
            <Button variant="outlinePill" size="xs" onClick={vm.share} data-testid="relay-invite-share">
              <ShareIcon size={12} />
              {t('settings.invites.share')}
            </Button>
          )}
        </div>
      )}

      <div className="space-y-1">
        <div className="flex items-baseline justify-between gap-2">
          <Text as="span" size="xs" tone="default">
            {invite.max_uses == null
              ? t('settings.invites.peopleUnlimited', { uses: invite.uses })
              : t('settings.invites.people', { uses: invite.uses, max: invite.max_uses })}
          </Text>
          {invite.expires_at != null && vm.active && vm.daysLeft != null && (
            <Text as="span" size="xs" tone="muted">
              {t('settings.invites.expiresIn', { days: vm.daysLeft, date: formatDate(invite.expires_at * 1000) })}
            </Text>
          )}
        </div>
        {vm.usedPercent != null && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-lc-border/50" role="progressbar" aria-valuenow={vm.usedPercent} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-lc-green" style={{ width: `${vm.usedPercent}%` }} />
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Text as="p" size="xs" weight="semibold" tone="muted">{t('settings.invites.joinedTitle', { count: vm.joined.length })}</Text>
        {vm.joined.length === 0 ? (
          <Text as="p" size="xs" tone="muted">{t('settings.invites.nobodyYet')}</Text>
        ) : (
          <List marker="none" spacing="tight">
            {vm.joined.map((p) => <RelayInviteJoinedPerson key={p.pubkey} pubkey={p.pubkey} at={p.at} removed={p.removed} />)}
          </List>
        )}
      </div>

      {vm.active && !vm.confirming && (
        <Button variant="outlinePill" tone="danger" size="xs" onClick={vm.askTurnOff} data-testid="relay-invite-revoke">
          {t('settings.invites.revoke')}
        </Button>
      )}
      {vm.active && vm.confirming && (
        <div className="space-y-2 rounded-md border border-red-500/30 bg-red-500/5 p-2" data-testid="relay-invite-revoke-confirm">
          <Text as="p" size="xs" tone="default">{t('settings.invites.revokeConfirm')}</Text>
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" size="xs" onClick={() => void vm.turnOff()} loading={vm.busy} data-testid="relay-invite-revoke-yes">
              {t('settings.invites.revoke')}
            </Button>
            <Button variant="ghost" size="xs" onClick={vm.cancelTurnOff} disabled={vm.busy} data-testid="relay-invite-revoke-no">
              {t('settings.invites.revokeKeep')}
            </Button>
          </div>
        </div>
      )}
      {vm.error && <ErrorState>{vm.error}</ErrorState>}
    </Card>
  );
}
