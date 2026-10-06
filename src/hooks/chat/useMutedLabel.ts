'use client';

import { useTranslation } from '@/i18n/context';
import { useFormat } from '@/i18n/useFormat';
import { MUTED_FOREVER } from '@/store/channel-prefs';

/**
 * The hint under "Unmute": when the mute ends, in the reader's language, or
 * "muted until you turn it back on". `undefined` (not muted) gives null.
 */
export function useMutedLabel(until: number | undefined): string | null {
  const { t } = useTranslation();
  const { formatDateTime } = useFormat();
  if (until === undefined) return null;
  if (until === MUTED_FOREVER) return t('channelMenu.mutedForever');
  return t('channelMenu.mutedUntil').replace('{time}', formatDateTime(until, { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }));
}
