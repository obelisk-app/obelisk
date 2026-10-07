'use client';

import type { MouseEvent } from 'react';
import { useTranslations } from 'next-intl';
import { followChannelPill } from '@/services/chat/message/in-app-link';

/**
 * A channel pill's label and click. The pill names the channel by its slug
 * (there is no slug lookup), so access is never known to be missing; the
 * locked look stays wired for when it is.
 */
export function useChannelLinkPill(slug: string, href: string, messageId?: string, postId?: string) {
  const t = useTranslations();
  const channel = slug;
  const noAccess = false;
  const kind = postId ? 'publication' : messageId ? 'message' : 'channel';
  return {
    noAccess,
    prefix: postId ? '📋 ' : messageId ? '↩ ' : '#',
    label: channel,
    title: noAccess ? t('chat.channelLink.noAccess', { channel }) : t(`chat.channelLink.${kind}`, { channel }),
    onClick: (e: MouseEvent) => followChannelPill(e, href, noAccess),
  };
}
