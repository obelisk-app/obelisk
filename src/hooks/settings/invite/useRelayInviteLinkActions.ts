'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { canShareLinks, copyInviteLink, shareInviteLink } from '@/services/relay/relay-invite-links';

const noSubscription = () => () => {};

/**
 * Copy and Share for one invite link (the new link and every card). Copy
 * reads "Copied" for two seconds after it worked; Share shows only where the
 * browser has a share sheet.
 */
export function useRelayInviteLinkActions(link: string, relayName: string) {
  const t = useTranslations();
  const [copied, setCopied] = useState(false);
  // False on the server render, which has no navigator; the browser's answer never changes.
  const canShare = useSyncExternalStore(noSubscription, canShareLinks, () => false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  return {
    copied,
    canShare,
    copy: () => {
      void copyInviteLink(link, t('settings.invites.copied'), t('settings.invites.copyRefused')).then(setCopied);
    },
    share: () => {
      void shareInviteLink(
        { title: t('settings.invites.shareTitle', { relay: relayName }), text: t('settings.invites.shareText', { relay: relayName }), url: link },
        t('settings.invites.copied'),
        t('settings.invites.copyRefused'),
      );
    },
  };
}
