'use client';

import type { RelaySettingsKind } from '@/hooks/shell/modals/relay/useRelaySettingsModal';

const PATHS = {
  profile: <><circle cx="12" cy="8" r="3"/><path d="M5 20a7 7 0 0 1 14 0M4 4h16v16H4z"/></>,
  emoji: <><circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/></>,
  channels: <><path d="M5 4v16M19 4v16M4 8h16M4 16h16"/><circle cx="8" cy="8" r="1" fill="currentColor"/><circle cx="16" cy="16" r="1" fill="currentColor"/></>,
  members: <><circle cx="9" cy="8" r="3"/><circle cx="17" cy="10" r="2"/><path d="M3 20a6 6 0 0 1 12 0M14 16a5 5 0 0 1 7 4"/></>,
  roles: <><path d="M12 3 9.5 8 4 9l4 4-1 6 5-3 5 3-1-6 4-4-5.5-1z"/></>,
} as const;

/** The icon of one relay settings destination. */
export function RelaySettingsIcon({ kind }: { kind: RelaySettingsKind }) {
  return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{PATHS[kind]}</svg>;
}
