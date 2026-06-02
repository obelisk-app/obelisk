'use client';

/**
 * Obelisk-owned login modal.
 *
 * The modal *chrome* (backdrop, portal, ESC handling, scroll lock) is
 * owned by obelisk via the SDK's `<Modal>` primitive — we explicitly do
 * not consume the SDK's higher-level `<LoginModal>` wrapper, because we
 * want to control mount/dismiss/sizing without inheriting the wrapper's
 * defaults (e.g. `closeOnSuccess`).
 *
 * The modal *contents* (method picker, NIP-46 QR + paste, generate +
 * import flows) are the SDK's `<LoginWidget>`. That keeps the visual
 * identical to upstream — same `.nui-*` markup that obelisk styles
 * through its global theme — while letting us evolve the modal class
 * here without re-rendering the auth pipeline.
 *
 * Auth pipeline:
 *   1. `<LoginWidget>` runs the chosen method, attaches the resulting
 *      `NostrSigner` to the SDK session via its internal `useLogin`.
 *   2. Our `onLogin` callback then routes the same credentials into
 *      obelisk's bridge so its session (relays, subscriptions, cache)
 *      is in sync with the SDK session.
 */

import {
  Modal,
  LoginWidget,
  type LoginMethodId,
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

/**
 * Forwards a successful SDK login into obelisk's bridge so the
 * bridge-managed session (relay handshake, NIP-42 AUTH, global subs)
 * stays paired with the SDK session.
 */
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
      // Reuse the SDK's `clientNsec` so the bunker recognizes the pairing —
      // a fresh client key would be rejected (no prior authorization).
      await nostrActions.loginWithBunker(bunkerUri, {
        ...(clientNsec ? { clientSecretHex: nsecToSkHex(clientNsec) } : {}),
      });
      return;
    }
  }
}

interface LoginModalProps {
  onSuccess?: () => void;
  /** Restrict the picker to a subset of methods. Mobile uses this to
   *  scope the popup to a single picked entry point. */
  methods?: LoginMethodId[];
  /** Caller-provided dismiss. Without it, the modal can't be closed
   *  (matches the AppShell case where login is mandatory). */
  onClose?: () => void;
  /** Override the widget's heading. */
  title?: string;
  /** Override the widget's subheading. */
  subtitle?: string;
  /** Node rendered above the title — e.g. the obelisk hero mark on mobile. */
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
  // AppShell mounts this only while logged-out; in that case the modal is
  // not dismissible. Mobile + landing pages supply their own `onClose`.
  const close = onClose ?? (() => { /* not dismissible */ });

  return (
    <Modal
      open
      onClose={close}
      aria-label="Sign in to Nostr"
      showClose={Boolean(onClose)}
      closeOnEscape={Boolean(onClose)}
      closeOnOverlay={Boolean(onClose)}
    >
      <LoginWidget
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
        // `slots.header` keeps the obelisk hero mark above the title on
        // mobile. The cross-package React 18/19 type drift makes a direct
        // assignment unhappy — the runtime shape is identical.
        {...(headerSlot ? { slots: { header: headerSlot as never } } : {})}
        onSuccess={close}
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
    </Modal>
  );
}
