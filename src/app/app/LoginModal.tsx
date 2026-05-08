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
import type { SVGProps } from 'react';
import { nostrActions } from '@/lib/nostr-bridge';

const iconBase = {
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  viewBox: '0 0 24 24',
  width: 20,
  height: 20,
};
const LockIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...iconBase} {...p}>
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0110 0v4" />
  </svg>
);
const ShieldIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...iconBase} {...p}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);
const SparkleIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...iconBase} {...p}>
    <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" />
    <path d="M19 15l.7 1.7L21.5 17.5l-1.8.8L19 20l-.7-1.7L16.5 17.5l1.8-.8z" />
  </svg>
);
const KeyIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...iconBase} {...p}>
    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
  </svg>
);

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

interface LoginModalProps {
  onSuccess?: () => void;
  /** When provided, restrict the SDK modal to these methods (forwarded as-is). */
  methods?: LoginMethodId[];
  /** Lets the host dismiss the modal. Defaults to a no-op when the modal is the
   * only visible UI (desktop AppShell). */
  onClose?: () => void;
  /** Passed through so a host can override the SDK's default copy. */
  title?: string;
  subtitle?: string;
}

export default function LoginModal({
  onSuccess,
  methods,
  onClose,
  title = 'Connect to Nostr',
  subtitle = 'Choose your login method',
}: LoginModalProps = {}) {
  return (
    <NostrSessionProvider autoRestore={false} theme="la-crypta">
      <SdkLoginModal
        open
        onClose={onClose ?? (() => { /* AppShell only mounts this when logged out — no dismiss */ })}
        title={title}
        subtitle={subtitle}
        flatLayout
        methods={methods}
        methodIcons={{
          nip07: <LockIcon />,
          nip46: <ShieldIcon />,
          generate: <SparkleIcon />,
          import: <KeyIcon />,
        }}
        onLogin={async ({ pubkey, method }) => {
          await routeToBridge(method, pubkey);
          onSuccess?.();
        }}
      />
    </NostrSessionProvider>
  );
}
