'use client';

/**
 * Production login modal - thin wrapper around `@nostr-wot/ui`'s
 * `<LoginWidget>`. Updates to the fork's UI flow into obelisk-dex via
 * the `file:../nostr-wot-sdk/packages/ui` dep.
 *
 * The SDK builds its own `NostrSigner` and now hands the bridging
 * material directly through `onLogin` (`nsec` for generate/import,
 * `bunkerUri` and its paired signer for nip46). We route each method to the existing bridge
 * entrypoint without touching the SDK's localStorage (`login/login-bridge.ts`):
 *   - nip07              → bridge.loginWithNip07(pubkey)
 *   - import / generate  → bridge.loginWithNsec(skHex, pkHex) using args.nsec
 *   - nip46              → bridge.loginWithBunker(args.bunkerUri)
 *
 * The bridge receives the final signer only after the generated-key backup,
 * profile, and public-profile sharing steps are complete.
 */

import { LoginModal as SdkLoginModal, type LoginMethodId } from '@nostr-wot/ui';
import type { ReactNode } from 'react';
import { OBELISK_NIP46_PERMISSIONS } from '@/utils/nostr-signing-kinds';
import GeneratedProfileEnhancements from './GeneratedProfileEnhancements';
import { GeneratedNpubStep } from './login/GeneratedNpubStep';
import { LOGIN_METHOD_ICONS } from './login/LoginIcons';
import { Nip46SignerDeepLink } from './login/useNip46SignerDeepLink';
import { useLoginFlow } from './login/useLoginFlow';

export { copyConnectionUri, isTransientNip46Error, signerAppHref } from './login/signer-link';

const NIP46_PERMS = OBELISK_NIP46_PERMISSIONS;

const NIP46_METADATA = {
  name: 'Obelisk',
  url: 'https://obelisk.ar',
};

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
  /** Optional node rendered above the title - e.g. the obelisk hero mark on mobile. */
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
  const flow = useLoginFlow({ onSuccess, onClose });

  if (flow.generatedLogin) {
    return (
      <GeneratedNpubStep
        pubkey={flow.generatedLogin.pubkey}
        onClose={onClose ?? flow.backFromGenerated}
        onBack={flow.backFromGenerated}
        shared={flow.shared}
        onShare={() => void flow.shareProfile()}
        finishing={flow.finishing}
        finishError={flow.finishError}
        onFinish={() => void flow.finish()}
      />
    );
  }

  return (
    <>
      <Nip46SignerDeepLink />
      <GeneratedProfileEnhancements onDraftChange={flow.updateGeneratedProfile} />
      <SdkLoginModal
        key={flow.nip46Retry}
        open
        onClose={flow.closeLogin}
        closeOnSuccess={false}
        title={title}
        subtitle={subtitle}
        flatLayout
        showRememberToggle
        profileSetup
        nip46Relays={['wss://public.obelisk.ar']}
        nip46Perms={NIP46_PERMS}
        nip46Metadata={NIP46_METADATA}
        methods={methods}
        modalClasses={{ modal: 'obelisk-login-modal' }}
        {...(flow.hideTransientError ? { styles: { error: { display: 'none' } } } : {})}
        onError={flow.handleSdkError}
        methodIcons={LOGIN_METHOD_ICONS}
        {...(headerSlot ? { slots: { header: headerSlot } } : {})}
        onLogin={flow.onLogin}
      />
    </>
  );
}
