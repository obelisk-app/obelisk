'use client';

/**
 * Settings > Invite people, for accounts the relay lets invite: make a link,
 * share it, see who joined on each. Whoever opens a link lands in the app
 * with a key made for them and is let into the relay; the flow is
 * docs/features/relay-invites.md.
 */
import Section from '@/components/ui/layout/Section';
import { useTranslations } from 'next-intl';
import Button from '@/components/ui/buttons/Button';
import Text from '@/components/ui/layout/Text';
import Skeleton from '@/components/ui/animations/Skeleton';
import { useRelayInviteSettings } from '@/hooks/settings/invite/useRelayInviteSettings';
import RelayInviteCodeCard from './RelayInviteCodeCard';

export default function RelayInviteSettings({ mobile = false }: { mobile?: boolean }) {
  const t = useTranslations();
  const vm = useRelayInviteSettings();
  const me = vm.me;

  return (
    <Section
      variant={mobile ? 'mobile' : 'settings'}
      headingAs="h3"
      title={t('settings.invites.title')}
      className={mobile ? undefined : 'space-y-3'}
      contentClassName={mobile ? 'settings-row !block space-y-3' : undefined}
      data-testid="relay-invite-settings"
    >
      <Text as="p" size="xs" tone="muted">{t('settings.invites.intro', { relay: vm.relayHost })}</Text>
      {vm.loading ? (
        <Skeleton variant="pulse" className="h-16 rounded-lg bg-lc-border/40" data-testid="relay-invites-loading" />
      ) : !me?.can_mint && !me?.codes.length ? (
        <Text as="p" size="xs" tone="default" data-testid="relay-invites-none">{t('settings.invites.notAllowed')}</Text>
      ) : (
        <>
          {me.is_admin ? (
            <Text as="p" size="xs" tone="default">{t('settings.invites.quotaAdmin')}</Text>
          ) : (
            <Text as="p" size="xs" tone="default" data-testid="relay-invites-quota">
              {t('settings.invites.quota', { people: me.admits_left ?? 0, links: me.codes_left ?? 0 })}
            </Text>
          )}
          <Button onClick={() => void vm.create()} disabled={vm.busy || !me.can_mint} loading={vm.busy} data-testid="relay-invite-create">
            {t('settings.invites.create')}
          </Button>
          {vm.error && <Text as="p" size="xs" tone="danger" role="alert">{vm.error}</Text>}
          {vm.rows.map((row) => (
            <RelayInviteCodeCard
              key={row.invite.code}
              invite={row.invite}
              link={row.link}
              copied={row.copied}
              usedPercent={row.usedPercent}
              daysLeft={row.daysLeft}
              joined={row.joined}
              busy={vm.busy}
              onCopy={() => vm.copy(row.invite.code)}
              onRevoke={() => void vm.revoke(row.invite.code)}
            />
          ))}
        </>
      )}
    </Section>
  );
}
