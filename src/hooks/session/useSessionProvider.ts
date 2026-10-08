'use client';

import { useEffect, useMemo } from 'react';
import type { BridgeImpl } from '@/services/nostr-bridge';
import { createSessionController } from '@/services/session/controller';

/** Mount the session adapter over the existing bridge; cleanup never logs out or disposes the page bridge. */
export function useSessionProvider(bridge: BridgeImpl | null, ready: boolean) {
  const controller = useMemo(() => createSessionController(bridge, ready), [bridge, ready]);
  useEffect(() => controller.start(), [controller]);
  return controller;
}
