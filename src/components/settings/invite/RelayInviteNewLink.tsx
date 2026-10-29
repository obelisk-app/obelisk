'use client';

import { useTranslations } from 'next-intl';
import Card from '@/components/ui/layout/Card';
import Button from '@/components/ui/buttons/Button';
import Text from '@/components/ui/layout/Text';
import { useRelayInviteLinkActions } from '@/hooks/settings/invite/useRelayInviteLinkActions';
import { CopyIcon, ShareIcon } from '@/assets/icons';

/**
 * The link just made, on its own above the list, with Copy and Share. Nothing
 * is copied behind the person's back: the clipboard only answers a click.
 */
export default function RelayInviteNewLink({ link, relayName }: { link: string; relayName: string }) {
  const t = useTranslations();
  const vm = useRelayInviteLinkActions(link, relayName);
  return (
    <Card surface="subtle" radius="lg" className="space-y-2 border border-lc-green/40" data-testid="relay-invite-new-link">
      <Text as="p" size="sm" weight="semibold" tone="accent">{t('settings.invites.newLinkTitle')}</Text>
      <Text as="p" size="xs" tone="muted">{t('settings.invites.newLinkHint')}</Text>
      <Text as="p" size="sm" tone="default" className="select-all break-all rounded-md border border-lc-border bg-lc-black/40 px-2 py-1.5 font-mono" data-testid="relay-invite-new-link-url">{link}</Text>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={vm.copy} aria-live="polite" data-testid="relay-invite-new-copy">
          <CopyIcon size={14} />
          {vm.copied ? t('settings.invites.copiedShort') : t('settings.invites.copy')}
        </Button>
        {vm.canShare && (
          <Button size="sm" variant="outline" onClick={vm.share} data-testid="relay-invite-new-share">
            <ShareIcon size={14} />
            {t('settings.invites.share')}
          </Button>
        )}
      </div>
    </Card>
  );
}
