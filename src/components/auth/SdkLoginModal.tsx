'use client';

/**
 * Obelisk's wrapper around `@nostr-wot/ui`'s `<LoginModal>`.
 *
 * Reuses everything the SDK ships (NIP-07, NIP-46 QR + paste tabs,
 * Generate, Import, NIP-98 challenge → sign → verify flow against
 * `/api/auth`, profile setup, encrypted-at-rest storage via the
 * `obeliskSdkSignerStorage` adapter mounted at the root provider) and
 * folds in obelisk-specific app state mirroring on top.
 *
 * Drop-in replacement for the legacy `<LoginModal>`. Preserves the
 * `{ isOpen, onClose, onSuccess?, transparentBackdrop? }` props so the
 * three call sites (Navbar, chat/page, invite/[code]/page, LandingPage)
 * don't need to change.
 */

import { LoginModal as SdkLoginModal } from '@nostr-wot/ui';
import { nip19 } from 'nostr-tools';
import { setNDKSigner, type LoginMethod } from '@/lib/nostr';
import { useAuthStore } from '@/store/auth';

const SDK_METHOD_TO_OBELISK: Record<string, LoginMethod> = {
  nip07: 'extension',
  nip46: 'bunker',
  generate: 'nsec',
  import: 'nsec',
};

export interface ObeliskLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  transparentBackdrop?: boolean;
}

export default function LoginModal({
  isOpen,
  onClose,
  onSuccess,
  transparentBackdrop,
}: ObeliskLoginModalProps) {
  return (
    <SdkLoginModal
      open={isOpen}
      onClose={onClose}
      title="Welcome to Obelisk"
      subtitle="Sign in with your Nostr keys — no email, no password."
      methods={['nip07', 'nip46', 'generate', 'import']}
      profileSetup
      nip46Mode="qr"
      nip46Metadata={{ name: 'Obelisk', url: 'https://obelisk.ar' }}
      authBaseUrl="/api/auth"
      modalStyles={
        transparentBackdrop
          ? { overlay: { background: 'rgba(0, 0, 0, 0.85)' } }
          : undefined
      }
      onLogin={async ({ signer, pubkey, method }) => {
        // Mirror the SDK signer into obelisk's hub so all of its existing
        // sign/encrypt/decrypt call sites (DMs, posts, profile updates)
        // pick it up. The hub stores the NostrSigner directly — no NDK
        // adapter required.
        setNDKSigner(signer);

        // Mirror into obelisk's auth store. SDK has already run the
        // backend handshake (via `authBaseUrl`), so the cookie is set;
        // we just need the React state.
        const obeliskMethod: LoginMethod = SDK_METHOD_TO_OBELISK[method] ?? 'extension';
        useAuthStore.getState().setUser(
          { pubkey, npub: nip19.npubEncode(pubkey) },
          obeliskMethod,
        );

        // Best-effort profile sync — don't block on slow relays.
        void useAuthStore.getState().syncProfile();
      }}
      onSuccess={onSuccess}
    />
  );
}
