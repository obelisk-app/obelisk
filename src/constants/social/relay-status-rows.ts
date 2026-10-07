/**
 * Social: relay status rows. Values the code in
 * `utils/social/relay-status-rows.ts` reads, kept here so every reader imports
 * the one copy.
 */

import type { RelayState } from '@/services/social/relay-status';

/** The dot colour for each relay state. */
export const RELAY_STATE_DOT: Readonly<Record<RelayState, string>> = {
  connected: 'bg-lc-green',
  connecting: 'bg-amber-400 animate-pulse',
  unknown: 'bg-lc-border',
  failed: 'bg-red-500',
  offline: 'bg-lc-muted',
};
