import type { WotStatus } from '@/services/wot';

/** The extension status line: its copy and colour. */
export function wotStatusView(status: WotStatus) {
  if (status === 'configured') return { labelKey: 'settings.wot.status.configured' as const, toneClass: 'text-lc-green' };
  if (status === 'error') return { labelKey: 'settings.wot.status.error' as const, toneClass: 'text-red-400' };
  return { labelKey: 'settings.wot.status.missing' as const, toneClass: 'text-lc-muted' };
}
