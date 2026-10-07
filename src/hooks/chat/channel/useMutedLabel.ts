'use client';

import { useTranslations } from 'next-intl';
import { useFormat } from '@/i18n/useFormat';
import { MUTED_FOREVER } from '@/store/chat/channel-prefs';

/**
 * The hint under "Unmute": when the mute ends, in the reader's language, or
 * "muted until you turn it back on". `undefined` (not muted) gives null.
 */
export function useMutedLabel(until: number | undefined): string | null {
  const t = useTranslations();
  const { formatDateTime } = useFormat();
  if (until === undefined) return null;
  if (until === MUTED_FOREVER) return t('chat.channelMenu.mutedForever');
  return t('chat.channelMenu.mutedUntil', { time: formatDateTime(until, { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }) });
}
