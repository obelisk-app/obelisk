'use client';

// src/lib/wallet/local-client.ts
// React hook returning a memoized @getalby/sdk NWCClient instantiated from
// the user's locally-stored NWC URI (encrypted with the DM cache key).
// All wallet operations call methods on this client; the server has no
// wallet credentials and cannot proxy.

import { useEffect, useRef, useState, useCallback } from 'react';
import { NWCClient } from '@getalby/sdk';
import { hasLocalWallet, readLocalWallet, clearLocalWallet } from './local-store';
import type { KEKSigner } from '@/lib/dm/cache-key';

export interface UseLocalWalletResult {
  client: NWCClient | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  disconnect: () => Promise<void>;
}

export function useLocalWallet(
  pubkey: string | null,
  signer: KEKSigner | null,
): UseLocalWalletResult {
  const [client, setClient] = useState<NWCClient | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<NWCClient | null>(null);

  const reload = useCallback(async () => {
    if (!pubkey || !signer) {
      setClient(null);
      return;
    }
    if (!hasLocalWallet(pubkey)) {
      setClient(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const wallet = await readLocalWallet(pubkey, signer);
      if (!wallet) {
        setClient(null);
        return;
      }
      // Close previous client if rotating.
      if (clientRef.current) {
        try { clientRef.current.close?.(); } catch { /* ignore */ }
      }
      const c = new NWCClient({ nostrWalletConnectUrl: wallet.nwcUri });
      clientRef.current = c;
      setClient(c);
    } catch (e) {
      setError((e as Error).message);
      setClient(null);
    } finally {
      setLoading(false);
    }
  }, [pubkey, signer]);

  const disconnect = useCallback(async () => {
    if (!pubkey) return;
    if (clientRef.current) {
      try { clientRef.current.close?.(); } catch { /* ignore */ }
      clientRef.current = null;
    }
    await clearLocalWallet(pubkey);
    setClient(null);
  }, [pubkey]);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => () => {
    if (clientRef.current) {
      try { clientRef.current.close?.(); } catch { /* ignore */ }
    }
  }, []);

  return { client, loading, error, reload, disconnect };
}
