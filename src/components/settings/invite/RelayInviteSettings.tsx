'use client';

/**
 * Settings > Invite people. Settings are global, so the panel starts by
 * naming the relay the links are for (the one in view, or another of the
 * person's relays picked here), says who may invite there and how much of
 * this account's allowance is left, then: make a link, and the links already
 * made with who joined on each. Flow: docs/features/relay-invites.md.
 */
import Section from '@/components/ui/layout/Section';
import { useTranslations } from 'next-intl';
import Button from '@/components/ui/buttons/Button';
import Text from '@/components/ui/layout/Text';
import Skeleton from '@/components/ui/animations/Skeleton';
import ErrorState from '@/components/ui/feedback/ErrorState';
import { useRelayInviteSettings } from '@/hooks/settings/invite/useRelayInviteSettings';
import { ChevronDownIcon, ChevronRightIcon } from '@/assets/icons';
import RelayInviteRelayPicker from './RelayInviteRelayPicker';
import RelayInviteAllowance from './RelayInviteAllowance';
import RelayInviteInvitedBy from './RelayInviteInvitedBy';
import RelayInviteCreateForm from './RelayInviteCreateForm';
import RelayInviteNewLink from './RelayInviteNewLink';
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
      className={mobile ? undefined : 'space-y-4'}
      contentClassName={mobile ? 'settings-row !block space-y-4' : undefined}
      data-testid="relay-invite-settings"
    >
      <RelayInviteRelayPicker choices={vm.choices} value={vm.relay} onPick={vm.pick} mobile={mobile} />

      {vm.loading ? (
        <Skeleton variant="pulse" className="h-16 rounded-lg bg-lc-border/40" data-testid="relay-invites-loading" />
      ) : vm.failed ? (
        <div className="space-y-2" data-testid="relay-invites-failed">
          <ErrorState>{t('settings.invites.loadFailed', { relay: vm.relayName })}</ErrorState>
          <Button size="xs" variant="outlinePill" onClick={vm.retry} data-testid="relay-invites-retry">{t('settings.invites.retry')}</Button>
        </div>
      ) : !me ? (
        <Text as="p" size="xs" tone="default" data-testid="relay-invites-no-api">{t('settings.invites.noApi', { relay: vm.relayName })}</Text>
      ) : (
        <>
          {me.invited_by && <RelayInviteInvitedBy pubkey={me.invited_by.pubkey} at={me.invited_by.at} />}
          <RelayInviteAllowance explanation={vm.explanation ?? ''} allowance={vm.allowance} spent={vm.spent} relayName={vm.relayName} />
          {vm.created && <RelayInviteNewLink link={vm.created} relayName={vm.relayName} />}
          {vm.canCreate && vm.limits && (
            <RelayInviteCreateForm key={`${vm.relay}|${vm.limits.maxPeople}`} relay={vm.relay} limits={vm.limits} onCreated={vm.onCreated} />
          )}

          {vm.active.length > 0 && (
            <div className="space-y-2" data-testid="relay-invites-active">
              <Text as="p" size="xs" weight="semibold" tone="muted">{t('settings.invites.activeTitle')}</Text>
              {vm.active.map((row) => (
                <RelayInviteCodeCard key={row.invite.code} relay={vm.relay} relayName={vm.relayName} invite={row.invite} link={row.link} at={row.at} onChanged={vm.refresh} />
              ))}
            </div>
          )}

          {vm.past.length > 0 && (
            <div className="space-y-2">
              <Button variant="ghost" size="xs" onClick={vm.togglePast} aria-expanded={vm.pastOpen} data-testid="relay-invites-past-toggle">
                {vm.pastOpen ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
                {t('settings.invites.pastTitle', { count: vm.past.length })}
              </Button>
              {vm.pastOpen && vm.past.map((row) => (
                <RelayInviteCodeCard key={row.invite.code} relay={vm.relay} relayName={vm.relayName} invite={row.invite} link={row.link} at={row.at} onChanged={vm.refresh} />
              ))}
            </div>
          )}
        </>
      )}
    </Section>
  );
}
