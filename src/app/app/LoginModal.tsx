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
} from '@nostr-wot/ui';
import { getPublicKey } from 'nostr-tools/pure';
import { nsecToBytes, nsecToHex as sdkNsecToHex } from '@nostr-wot/data';
import { useEffect, type ReactNode, type SVGProps } from 'react';
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

/**
 * Local patch for an "Open in signer app" deep-link button inside the SDK's
 * NIP-46 QR view. The fork at `../nostr-wot-sdk` already implements this
 * (Nip46Method.tsx:323-331) but it's missing from the published npm v0.6.0
 * that we currently consume. This sidecar finds the rendered `nostrconnect://`
 * URI in the DOM and inserts a tappable `<a>` above the QR — useful on mobile
 * where the user can't scan their own screen but can hand off to Amber, Nsec.app,
 * Keychat, etc. via the registered URL scheme.
 *
 * Implementation note: we scope the MutationObserver to `.nui-modal-overlay`
 * (and wait for it to appear) instead of watching the whole document. The
 * SDK's QR view re-renders frequently (spinner, slow-hint, restart) and we
 * only care about a single text node — narrowing the scope keeps this from
 * thrashing on every spinner tick.
 *
 * TODO: once @nostr-wot/ui publishes a version with the native button, delete
 *       this component and the matching `.nui-open-signer` CSS rule.
 */
function Nip46SignerDeepLink(): null {
  useEffect(() => {
    if (typeof document === 'undefined') return;

    let injected: HTMLAnchorElement | null = null;
    let innerObserver: MutationObserver | null = null;

    const removeInjected = () => {
      if (injected && injected.isConnected) injected.remove();
      injected = null;
    };

    const sync = () => {
      const qrWrap = document.querySelector<HTMLElement>('.nui-modal .nui-qr-wrap');
      const uri = qrWrap?.querySelector<HTMLElement>('.nui-key-display')?.textContent?.trim();

      if (!qrWrap || !uri || !uri.startsWith('nostrconnect://')) {
        removeInjected();
        return;
      }
      if (injected && injected.isConnected && injected.getAttribute('href') === uri) return;

      removeInjected();
      const a = document.createElement('a');
      a.href = uri;
      a.className = 'nui-open-signer';
      a.rel = 'noopener noreferrer';
      const arrow = document.createElement('span');
      arrow.setAttribute('aria-hidden', 'true');
      arrow.textContent = '↗'; // ↗
      const label = document.createElement('span');
      label.textContent = 'Open in signer app';
      a.append(arrow, label);
      qrWrap.insertBefore(a, qrWrap.firstChild);
      injected = a;
    };

    const attachInner = (overlay: Element) => {
      innerObserver?.disconnect();
      innerObserver = new MutationObserver(sync);
      innerObserver.observe(overlay, { childList: true, subtree: true, characterData: true });
      sync();
    };

    // The SDK portals the overlay to <body> when it mounts; we have to wait
    // for that. A short interval is cheaper than a body-wide subtree
    // observer and only runs until the overlay appears.
    let outerInterval: ReturnType<typeof setInterval> | null = setInterval(() => {
      const overlay = document.querySelector('.nui-modal-overlay');
      if (!overlay) return;
      if (outerInterval) { clearInterval(outerInterval); outerInterval = null; }
      attachInner(overlay);
    }, 100);

    // Fast-path: overlay may already be in the DOM by the time this effect runs.
    const existing = document.querySelector('.nui-modal-overlay');
    if (existing) {
      if (outerInterval) { clearInterval(outerInterval); outerInterval = null; }
      attachInner(existing);
    }

    return () => {
      if (outerInterval) clearInterval(outerInterval);
      innerObserver?.disconnect();
      removeInjected();
    };
  }, []);

  return null;
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
    <>
      <Nip46SignerDeepLink />
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
        {...(headerSlot ? { slots: { header: headerSlot } } : {})}
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
    </>
  );
}
