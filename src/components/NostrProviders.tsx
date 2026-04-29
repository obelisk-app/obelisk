'use client';
import { NostrSessionProvider } from '@nostr-wot/ui';
import { obeliskSdkSignerStorage } from '@/lib/auth/sdk-signer-storage';
import '@nostr-wot/ui/styles.css';

export function ObeliskNostrProvider({ children }: { children: React.ReactNode }) {
  return (
    <NostrSessionProvider
      autoRestore={false}
      signerStorage={obeliskSdkSignerStorage}
      theme="la-crypta"
    >
      {children}
    </NostrSessionProvider>
  );
}
