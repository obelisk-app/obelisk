'use client';

/**
 * Production login modal — thin wrapper around `@nostr-wot/ui`'s
 * `<LoginWidget>`. Updates to the fork's UI flow into obelisk-dex via
 * the `file:../nostr-wot-sdk/packages/ui` dep.
 *
 * The SDK builds + persists its own `NostrSigner`. Until the bridge has
 * a polymorphic `loginWithSigner()` adapter, we route each method back
 * to the existing bridge entrypoints by pulling the persisted material:
 *   - nip07            → bridge.loginWithNip07(pubkey)
 *   - import / generate → read nsec from `@nostr-wot/ui:nsec` → bridge.loginWithNsec
 *   - nip46            → read pairing from `@nostr-wot/ui:nip46` → bridge.loginWithBunker
 *
 * See docs/nostr-wot-sdk-fork.md for the cleaner future migration.
 */

import {
  LoginModal as SdkLoginModal,
  NostrSessionProvider,
  SIGNER_STORAGE_KEY_NSEC,
  readPersistedNip46,
  type LoginMethodId,
} from '@nostr-wot/ui';
import { nip19, getPublicKey } from 'nostr-tools';
import { nostrActions } from '@/lib/nostr-bridge';

function nsecToHex(nsec: string): { skHex: string; pkHex: string } {
  const decoded = nip19.decode(nsec);
  if (decoded.type !== 'nsec') throw new Error('Invalid nsec');
  const sk = decoded.data as Uint8Array;
  const skHex = Array.from(sk).map((b) => b.toString(16).padStart(2, '0')).join('');
  const pkHex = getPublicKey(sk);
  return { skHex, pkHex };
}

async function routeToBridge(method: LoginMethodId, pubkey: string): Promise<void> {
  switch (method) {
    case 'nip07':
      await nostrActions.loginWithNip07(pubkey);
      return;

    case 'import':
    case 'generate': {
      const nsec = window.localStorage.getItem(SIGNER_STORAGE_KEY_NSEC);
      if (!nsec) throw new Error('SDK did not persist an nsec to storage');
      const { skHex, pkHex } = nsecToHex(nsec);
      await nostrActions.loginWithNsec(skHex, pkHex);
      return;
    }

    case 'nip46': {
      const record = await readPersistedNip46();
      if (!record?.uri) throw new Error('SDK did not persist a NIP-46 URI');
      await nostrActions.loginWithBunker(record.uri);
      return;
    }
  }
}

export default function LoginModal({ onSuccess }: { onSuccess?: () => void } = {}) {
  return (
    <NostrSessionProvider autoRestore={false} theme="la-crypta">
      <SdkLoginModal
        open
        onClose={() => { /* AppShell only mounts this when logged out — no dismiss */ }}
        title="Connect to Nostr"
        subtitle="Choose your login method"
        onLogin={async ({ pubkey, method }) => {
          await routeToBridge(method, pubkey);
          onSuccess?.();
        }}
      />
    </NostrSessionProvider>
  );
}
