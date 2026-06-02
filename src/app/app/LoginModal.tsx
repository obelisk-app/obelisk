'use client';

/**
 * Obelisk-owned login modal.
 *
 * Obelisk renders the modal chrome + picker JSX itself (same `.nui-*`
 * class names as upstream so the La Crypta CSS theme in globals.css
 * applies cleanly — visual is identical to main). The per-method panels
 * (NIP-07 button, NIP-46 QR + paste, generate, import) come from the
 * SDK directly; we never reach for `<LoginWidget>` or `<LoginModal>`.
 *
 * Auth pipeline:
 *   1. The SDK method component runs its flow and calls `attach(signer, pubkey, extras)`.
 *   2. `attach` pushes the signer into the SDK session via `useLogin`.
 *   3. The same credentials are mirrored into obelisk's bridge so its
 *      relay handshake / NIP-42 / global subs stay paired with the SDK session.
 */

import { useState, type ReactNode, type SVGProps } from 'react';
import {
  Modal,
  Nip07Method,
  Nip46Method,
  GenerateMethod,
  ImportMethod,
  type LoginMethodId,
} from '@nostr-wot/ui';
import type { NostrSigner } from '@nostr-wot/signers';
import { useLogin } from '@nostr-wot/data/react';
import { getPublicKey } from 'nostr-tools/pure';
import { nsecToBytes, nsecToHex as sdkNsecToHex } from '@nostr-wot/data';
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
 * Mirrors a successful SDK login into obelisk's bridge so the
 * bridge-managed session stays paired with the SDK session.
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
      // Reuse the SDK's `clientNsec` — a fresh client key would be
      // rejected by the bunker since it never authorized it.
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
  methods?: ReadonlyArray<LoginMethodId>;
  /** Caller-provided dismiss. Without it, the modal can't be closed
   *  (matches the AppShell case where login is mandatory). */
  onClose?: () => void;
  /** Override the picker heading. */
  title?: string;
  /** Override the picker subheading. */
  subtitle?: string;
  /** Node rendered above the title — e.g. the obelisk hero mark on mobile. */
  headerSlot?: ReactNode;
}

type ActiveView =
  | { kind: 'picker' }
  | { kind: 'nip46' }
  | { kind: 'generate' }
  | { kind: 'import' };

function methodAllowed(
  id: LoginMethodId,
  methods?: ReadonlyArray<LoginMethodId>,
): boolean {
  return !methods || methods.includes(id);
}

export default function LoginModal({
  onSuccess,
  methods,
  onClose,
  title = 'Connect to Nostr',
  subtitle = 'Choose your login method',
  headerSlot,
}: LoginModalProps = {}) {
  const login = useLogin();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // When the modal is scoped to a single non-list method, open directly
  // into that method's panel — matches the mobile pre-picker UX.
  const initialView: ActiveView = (() => {
    if (!methods || methods.length !== 1) return { kind: 'picker' };
    switch (methods[0]) {
      case 'nip46': return { kind: 'nip46' };
      case 'generate': return { kind: 'generate' };
      case 'import': return { kind: 'import' };
      default: return { kind: 'picker' };
    }
  })();
  const [view, setView] = useState<ActiveView>(initialView);
  const goBack = () => { setView({ kind: 'picker' }); setError(null); };

  const close = onClose ?? (() => { /* not dismissible from the desktop AppShell mount */ });

  // Single attach handler — invoked by every SDK method component's
  // `onAttached` callback. Pushes the signer into the SDK session via
  // `useLogin`, then mirrors credentials into obelisk's bridge.
  async function attach(
    method: LoginMethodId,
    signer: NostrSigner,
    pubkey: string,
    extras?: { nsec?: string; bunkerUri?: string; clientNsec?: string },
  ): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await login(signer);
      await routeToBridge({
        method,
        pubkey,
        ...(extras?.nsec ? { nsec: extras.nsec } : {}),
        ...(extras?.bunkerUri ? { bunkerUri: extras.bunkerUri } : {}),
        ...(extras?.clientNsec ? { clientNsec: extras.clientNsec } : {}),
      });
      onSuccess?.();
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const onErr = (msg: string) => setError(msg);

  const showNip07 = methodAllowed('nip07', methods);
  const showNip46 = methodAllowed('nip46', methods);
  const showGenerate = methodAllowed('generate', methods);
  const showImport = methodAllowed('import', methods);

  return (
    <Modal
      open
      onClose={close}
      aria-label="Sign in to Nostr"
      showClose={Boolean(onClose)}
      closeOnEscape={Boolean(onClose)}
      closeOnOverlay={Boolean(onClose)}
    >
      <div className="nui-widget">
        {headerSlot}

        <div>
          <h2 className="nui-widget-title">{title}</h2>
          <p className="nui-widget-subtitle">{subtitle}</p>
        </div>

        {error && <div className="nui-error">{error}</div>}

        {busy && view.kind !== 'picker' && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--nui-muted)', fontSize: 13 }}>
            <span className="nui-spinner" /> Signing in…
          </div>
        )}

        {view.kind === 'picker' && (
          <div className="nui-widget-methods" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {showNip07 && (
              <Nip07Method
                onError={onErr}
                onAttached={(signer, pubkey) => attach('nip07', signer, pubkey)}
                icon={<LockIcon />}
              />
            )}
            {showNip46 && (
              <button
                type="button"
                className="nui-method-button"
                onClick={() => setView({ kind: 'nip46' })}
              >
                <span className="nui-method-icon" aria-hidden><ShieldIcon /></span>
                <span className="nui-method-text">
                  <span className="nui-method-label">Remote signer (bunker)</span>
                  <span className="nui-method-hint">NIP-46 — Amber, Nsec.app</span>
                </span>
              </button>
            )}
            {showGenerate && (
              <button
                type="button"
                className="nui-method-button"
                onClick={() => setView({ kind: 'generate' })}
              >
                <span className="nui-method-icon" aria-hidden><SparkleIcon /></span>
                <span className="nui-method-text">
                  <span className="nui-method-label">Create a new account</span>
                  <span className="nui-method-hint">Generates a fresh keypair on this device</span>
                </span>
              </button>
            )}
            {showImport && (
              <button
                type="button"
                className="nui-method-button"
                onClick={() => setView({ kind: 'import' })}
              >
                <span className="nui-method-icon" aria-hidden><KeyIcon /></span>
                <span className="nui-method-text">
                  <span className="nui-method-label">Paste private key</span>
                  <span className="nui-method-hint">nsec or 64-char hex — risky in browsers</span>
                </span>
              </button>
            )}
          </div>
        )}

        {view.kind === 'nip46' && (
          <Nip46Method
            inline
            defaultMode="qr"
            onError={onErr}
            onAttached={(signer, pubkey, extras) => attach('nip46', signer, pubkey, extras)}
            onBack={goBack}
          />
        )}
        {view.kind === 'generate' && (
          <GenerateMethod
            onError={onErr}
            onAttached={(signer, pubkey, extras) => attach('generate', signer, pubkey, extras)}
            onBack={goBack}
          />
        )}
        {view.kind === 'import' && (
          <ImportMethod
            onError={onErr}
            onAttached={(signer, pubkey, extras) => attach('import', signer, pubkey, extras)}
            onBack={goBack}
          />
        )}
      </div>
    </Modal>
  );
}
