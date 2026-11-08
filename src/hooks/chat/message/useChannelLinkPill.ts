'use client';

import type { MouseEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useCurrentRelayUrl, useGroupById } from '@/services/nostr-bridge';
import { normalizeRelayInput } from '@/utils/relay-url/relay-url-input';
import { normalizeRelayUrl } from '@/utils/relay-url/normalize';
import { followChannelPill } from '@/services/chat/message/in-app-link';

/** Resolve names from the active relay's metadata, keeping unknown IDs usable. */
export function useChannelLinkPill(slug: string, href: string, messageId?: string, postId?: string) {
  const t = useTranslations();
  const relay = useCurrentRelayUrl();
  const targetRelay = new URL(href, typeof window === 'undefined' ? 'http://localhost' : window.location.href).searchParams.get('relay');
  const sameRelay = !targetRelay || normalizeRelayUrl(normalizeRelayInput(targetRelay) ?? '') === normalizeRelayUrl(relay);
  const group = useGroupById(sameRelay ? slug : null);
  const channel = group?.name?.trim() || slug;
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
