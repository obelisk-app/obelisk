'use client';

import Card from '@/components/ui/layout/Card';
import { useTranslations } from 'next-intl';
import Button from '@/components/ui/buttons/Button';
import Text from '@/components/ui/layout/Text';
import { useFormat } from '@/hooks/common/useFormat';
import type { RelayInviteCode } from '@/services/relay/relay-invite-api';

interface Props {
  invite: RelayInviteCode;
  link: string;
  /** Who joined on it, already shortened for display; empty when nobody has. */
  joined: string;
  busy: boolean;
  onCopy: () => void;
  onRevoke: () => void;
}

/** One invite link: its use, its expiry, who joined on it, Copy and Stop. */
export default function RelayInviteCodeCard({ invite, link, joined, busy, onCopy, onRevoke }: Props) {
  const t = useTranslations();
  const { formatDate } = useFormat();
  const active = invite.status === 'active';

  return (
    <Card surface="subtle" radius="lg" className="space-y-2" data-testid="relay-invite-code">
      <Text as="p" size="xs" className="break-all font-mono" tone={active ? 'default' : 'muted'}>{link}</Text>
      <Text as="p" size="xs" tone="muted">
        {t(`settings.invites.status.${invite.status}`)}
        {' · '}
        {invite.max_uses == null
          ? t('settings.invites.usesUnlimited', { uses: invite.uses })
          : t('settings.invites.uses', { uses: invite.uses, max: invite.max_uses })}
        {invite.expires_at != null && active && ` · ${t('settings.invites.expires', { date: formatDate(invite.expires_at * 1000) })}`}
      </Text>
      {joined && <Text as="p" size="xs" tone="default">{t('settings.invites.joined', { people: joined })}</Text>}
      {active && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outlinePill" size="xs" onClick={onCopy} data-testid="relay-invite-copy">{t('settings.invites.copy')}</Button>
          <Button variant="outlinePill" tone="danger" size="xs" onClick={onRevoke} disabled={busy} data-testid="relay-invite-revoke">
            {t('settings.invites.revoke')}
          </Button>
        </div>
      )}
    </Card>
  );
}
