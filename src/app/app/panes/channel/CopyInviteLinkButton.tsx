'use client';

import { useCurrentRelayUrl } from '@/services/nostr-bridge';
import { useTranslation } from '@/i18n/context';
import CopyButton from '@/components/ui/CopyButton';
import { channelInviteLink } from './invite-link';

/**
 * Copies this channel's invite link. On `CopyButton`, so the tick holds for
 * the shared 2000 ms (this button alone used 1500) and a refused clipboard no
 * longer claims success. The link is built from the page URL at render time;
 * it only reads `href`, which is the same on every render of this channel.
 */
export function CopyInviteLinkButton({ groupId }: { groupId: string }) {
  const { t } = useTranslation();
  const relay = useCurrentRelayUrl();
  const href = typeof window === 'undefined' ? '' : window.location.href;
  return (
    <CopyButton
      size="md"
      text={href ? channelInviteLink(href, groupId, relay) : ''}
      label={t('desktop.invite.copy')}
      copiedLabel={t('desktop.invite.copiedTitle')}
      className="rounded-md"
    />
  );
}
