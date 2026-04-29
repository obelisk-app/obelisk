'use client';

import { NostrSessionProvider } from '@nostr-wot/ui';
import type { NostrSigner } from '@nostr-wot/signers';
import { setNDKSigner } from '@/lib/nostr';
import { obeliskSdkSignerStorage } from '@/lib/auth/sdk-signer-storage';
import '@nostr-wot/ui/styles.css';

export function ObeliskNostrProvider({ children }: { children: React.ReactNode }) {
  return (
    <NostrSessionProvider
      autoRestore={false}
      signerStorage={obeliskSdkSignerStorage}
      theme="dark"
      onChange={({ signer }) => setNDKSigner(signer as NostrSigner | null)}
    >
      {children}
    </NostrSessionProvider>
  );
}
