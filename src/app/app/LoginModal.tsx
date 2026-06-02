'use client';

/**
 * Production login modal — thin wrapper around `@nostr-wot/ui`'s
 * `<LoginWidget>`. Updates to the fork's UI flow into obelisk-dex via
 * the `file:../nostr-wot-sdk/packages/ui` dep.
 *
 * The SDK builds its own `NostrSigner` and now hands the bridging
 * material directly through `onLogin` (`nsec` for generate/import,
 * `bunkerUri` for nip46). We route each method to the existing bridge
 * entrypoint without touching the SDK's localStorage:
 *   - nip07              → bridge.loginWithNip07(pubkey)
 *   - import / generate  → bridge.loginWithNsec(skHex, pkHex) using args.nsec
 *   - nip46              → bridge.loginWithBunker(args.bunkerUri)
 *
 * The bridge keeps its own session, so we suppress the SDK's
 * "Stay signed in" toggle to avoid two competing persistence layers.
 */

import {
  LoginModal as SdkLoginModal,
  type LoginMethodId,
  type LoginModalProps as SdkLoginModalProps,
} from '@nostr-wot/ui';
import { getPublicKey } from 'nostr-tools/pure';
import { nsecToBytes, nsecToHex as sdkNsecToHex } from '@nostr-wot/data';
import type { ReactNode, SVGProps } from 'react';
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
  const sk = nsecToBytes(nsec);
  if (!sk) throw new Error('Invalid nsec');
  const skHex = sdkNsecToHex(nsec);
  if (!skHex) throw new Error('Invalid nsec');
  const pkHex = getPublicKey(sk);
  return { skHex, pkHex };
}

function nsecToSkHex(nsec: string): string {
  const skHex = sdkNsecToHex(nsec);
  if (!skHex) throw new Error('Invalid nsec');
  return skHex;
}

async function routeToBridge(args: {
  method: LoginMethodId;
  pubkey: string;
  nsec?: string;
  bunkerUri?: string;
  clientNsec?: string;
}): Promise<void> {
  const { method, pubkey, nsec, bunkerUri, clientNsec } = args;
  switch (method) {
    case 'nip07':
      await nostrActions.loginWithNip07(pubkey);
      return;

    case 'import':
    case 'generate': {
      if (!nsec) throw new Error('SDK did not provide an nsec for the bridge');
      const { skHex, pkHex } = nsecToHex(nsec);
      if (method === 'generate' && typeof window !== 'undefined') {
        // Hint for the mobile setup gate: a freshly generated key has no
        // kind:0 to wait for, so PhoneShell can skip its grace period and
        // show the profile setup screen immediately.
        try { window.localStorage.setItem(`obelisk-dex/just-generated/${pkHex}`, '1'); } catch { /* ignore */ }
      }
      await nostrActions.loginWithNsec(skHex, pkHex);
      return;
    }

    case 'nip46': {
      if (!bunkerUri) throw new Error('SDK did not provide a bunker URI');
      // The SDK has already paired the remote signer with `clientNsec`.
      // We must reuse that client identity — a fresh key would be
      // rejected by the signer ("no secret") since it never authorized it.
      await nostrActions.loginWithBunker(bunkerUri, {
        ...(clientNsec ? { clientSecretHex: nsecToSkHex(clientNsec) } : {}),
      });
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
  /** Optional node rendered above the title — e.g. the obelisk hero mark on mobile. */
  headerSlot?: ReactNode;
}

export default function LoginModal({
  onSuccess,
  methods,
  onClose,
  title = 'Connect to Nostr',
  subtitle = 'Choose your login method',
  headerSlot,
}: LoginModalProps = {}) {
  return (
    <SdkLoginModal
        open
        onClose={onClose ?? (() => { /* AppShell only mounts this when logged out — no dismiss */ })}
        title={title}
        subtitle={subtitle}
        flatLayout
        showRememberToggle={false}
        methods={methods}
        methodIcons={{
          nip07: <LockIcon />,
          nip46: <ShieldIcon />,
          generate: <SparkleIcon />,
          import: <KeyIcon />,
        }}
        {...(headerSlot
          ? { slots: { header: headerSlot } as SdkLoginModalProps['slots'] }
          : {})}
        onLogin={async ({ pubkey, method, nsec, bunkerUri, clientNsec }) => {
          await routeToBridge({
            method,
            pubkey,
            ...(nsec ? { nsec } : {}),
            ...(bunkerUri ? { bunkerUri } : {}),
            ...(clientNsec ? { clientNsec } : {}),
          });
          onSuccess?.();
        }}
      />
  );
}
