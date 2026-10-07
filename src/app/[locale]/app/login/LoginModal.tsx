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
 * profile, and public-profile sharing steps are complete, and a pasted nsec
 * only after the person has read why that is the least safe way in
 * (`login/PastedKeyNoticeStep.tsx`).
 *
 * The SDK modal runs inside its own `NostrSessionProvider` with in-memory
 * signer storage (`src/services/login/signer-storage.ts`), so the widget never writes a
 * pairing key or a "remembered" nsec to localStorage, and `autoRestore` is
 * off: the bridge, not the SDK, restores sessions.
 */

import { LoginModal as SdkLoginModal, NostrSessionProvider, type LoginMethodId } from '@nostr-wot/ui';
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { usePastedKeyStep } from '@/hooks/shell/login/usePastedKeyStep';
import { OBELISK_NIP46_PERMISSIONS } from '@/utils/nostr/nostr-signing-kinds';
import GeneratedProfileEnhancements from './GeneratedProfileEnhancements';
import { GeneratedNpubStep } from './GeneratedNpubStep';
import { LOGIN_METHOD_ICONS } from './login-icons';
import { PastedKeyNoticeStep } from './PastedKeyNoticeStep';
import { SessionNoticeBanner } from './SessionNoticeBanner';
import { loginSignerStorage } from '@/services/login/signer-storage';
import { Nip46SignerDeepLink } from '@/hooks/shell/login/useNip46SignerDeepLink';
import { useLoginFlow } from '@/hooks/shell/login/useLoginFlow';

export { isTransientNip46Error, signerAppHref } from '@/utils/nip46/signer-link';

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
  title,
  subtitle,
  headerSlot,
}: LoginModalProps = {}) {
  const t = useTranslations();
  const flow = useLoginFlow({ onSuccess, onClose });
  const pasted = usePastedKeyStep(flow.onLogin);

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

  if (pasted.pending) {
    return (
      <PastedKeyNoticeStep
        onClose={onClose ?? pasted.back}
        onBack={pasted.back}
        onContinue={() => void pasted.confirm()}
        busy={pasted.busy}
        error={pasted.error}
      />
    );
  }

  return (
    <>
      <Nip46SignerDeepLink />
      <GeneratedProfileEnhancements onDraftChange={flow.updateGeneratedProfile} />
      <NostrSessionProvider autoRestore={false} signerStorage={loginSignerStorage} theme="la-crypta">
        <SdkLoginModal
          key={flow.nip46Retry}
          open
          onClose={flow.closeLogin}
          closeOnSuccess={false}
          title={title ?? t('shell.login.title')}
          subtitle={subtitle ?? t('shell.login.subtitle')}
          flatLayout
          showRememberToggle={false}
          profileSetup
          nip46Relays={['wss://public.obelisk.ar']}
          nip46Perms={NIP46_PERMS}
          nip46Metadata={NIP46_METADATA}
          methods={methods}
          modalClasses={{ modal: 'obelisk-login-modal' }}
          {...(flow.hideTransientError ? { styles: { error: { display: 'none' } } } : {})}
          onError={flow.handleSdkError}
          methodIcons={LOGIN_METHOD_ICONS}
          slots={{ ...(headerSlot ? { header: headerSlot } : {}), beforeMethods: <SessionNoticeBanner /> }}
          onLogin={pasted.intercept}
        />
      </NostrSessionProvider>
    </>
  );
}
