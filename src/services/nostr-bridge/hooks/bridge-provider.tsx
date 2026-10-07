'use client';

/**
 * `<BridgeProvider>`: the one place React gets the page bridge from. The app
 * passes nothing and the provider adopts the bridge `getBridge()` creates; a
 * test passes `bridge` to inject a fake, which is then also what
 * `getBridgeImpl()` returns inside any service the component calls, with no
 * module mock. The state lives in `hooks/provider.ts`; this file only renders.
 */
import type { ReactNode } from 'react';
import type { BridgeImpl } from '../facade/client';
import { BridgeContext, useProvidedBridge } from './provider';

export interface BridgeProviderProps {
  /** Tests only: the instance every hook and `getBridge*()` call sees while mounted. */
  bridge?: BridgeImpl;
  /**
   * Tests only: what `useBridgeReady()` reports for an injected bridge.
   * Default `true`. The app never passes it: readiness follows `initialize()`.
   */
  ready?: boolean;
  children: ReactNode;
}

export function BridgeProvider({ bridge, ready = true, children }: BridgeProviderProps) {
  const value = useProvidedBridge(bridge, ready);
  return <BridgeContext.Provider value={value}>{children}</BridgeContext.Provider>;
}
