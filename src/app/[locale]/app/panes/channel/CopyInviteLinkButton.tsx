'use client';

import { useCurrentRelayUrl } from '@/services/nostr-bridge';
import { useTranslations } from 'next-intl';
import CopyButton from '@/components/ui/buttons/CopyButton';
import { channelInviteLink } from '@/utils/chat/channel/channel-link';

/**
 * Copies this channel's invite link. On `CopyButton`, so the tick holds for
 * the shared 2000 ms (this button alone used 1500) and a refused clipboard no
 * longer claims success. The link is built from the page URL at render time;
 * it only reads `href`, which is the same on every render of this channel.
 */
export function CopyInviteLinkButton({ groupId }: { groupId: string }) {
  const t = useTranslations();
  const relay = useCurrentRelayUrl();
  const href = typeof window === 'undefined' ? '' : window.location.href;
  return (
    <CopyButton
      size="md"
      text={href ? channelInviteLink(href, groupId, relay) : ''}
      label={t('shell.desktop.invite.copy')}
      copiedLabel={t('shell.desktop.invite.copiedTitle')}
      className="rounded-md"
    />
  );
}
