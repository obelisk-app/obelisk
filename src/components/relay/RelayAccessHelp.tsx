'use client';

import { useTranslations } from 'next-intl';
import Button from '@/components/ui/buttons/Button';
import Heading from '@/components/ui/layout/Heading';
import Text from '@/components/ui/layout/Text';
import { CopyIcon, ShieldIcon } from '@/assets/icons';
import { useRelayAccessHelp } from '@/hooks/relay/status/useRelayAccessHelp';
import { cn } from '@/utils/style/cn';

/**
 * What a person the relay refused can do about it: ask the operator to add
 * their key (the npub ready to copy), or pick another relay. The empty state
 * of the desktop main pane and of the phone's channel list when the relay
 * answered `restricted`.
 */
export default function RelayAccessHelp({ onChooseRelay, className }: { onChooseRelay: () => void; className?: string }) {
  const t = useTranslations();
  const vm = useRelayAccessHelp();
  return (
    <div className={cn('mx-auto flex max-w-sm flex-col items-center gap-3 text-center', className)} data-testid="relay-access-help">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-400" aria-hidden>
        <ShieldIcon size={22} />
      </span>
      <Heading as="h2" variant="card" className="text-lc-white">{t('shell.relayAccess.title', { host: vm.host })}</Heading>
      <Text as="p" variant="muted">{t('shell.relayAccess.body')}</Text>
      {vm.npub && (
        <div className="flex w-full items-center gap-2 rounded-lg border border-lc-border bg-lc-card/60 px-3 py-2">
          <div className="min-w-0 flex-1 text-left">
            <Text as="div" variant="label" size="10" tone="muted" weight="semibold">{t('shell.relayAccess.npubLabel')}</Text>
            <Text as="div" size="sm" tone="default" className="truncate font-mono" data-testid="relay-access-npub">{vm.npubShort}</Text>
          </div>
          <Button variant="secondary" size="sm" onClick={vm.copyNpub} data-testid="relay-access-copy-npub">
            <CopyIcon size={14} />
            <span>{t('shell.user.copyNpub')}</span>
          </Button>
        </div>
      )}
      <Text as="p" variant="caption">{t('shell.relayAccess.other')}</Text>
      <Button variant="pill" size="sm" onClick={onChooseRelay} data-testid="relay-access-choose-relay">
        {t('shell.loginRecovery.chooseRelay')}
      </Button>
    </div>
  );
}
