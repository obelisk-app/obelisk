'use client';

import type { BridgeImpl } from '@/services/nostr-bridge';
import type { ReactNode } from 'react';
import { SessionContext } from '@/contexts/session/session';
import { useSessionProvider } from '@/hooks/session/useSessionProvider';

/** App session/profile ownership. The enclosing bridge remains the credential and protocol owner. */
export default function SessionProvider({ bridge, ready, children }: { bridge: BridgeImpl | null; ready: boolean; children: ReactNode }) {
  const controller = useSessionProvider(bridge, ready);
  return <SessionContext.Provider value={controller}>{children}</SessionContext.Provider>;
}
