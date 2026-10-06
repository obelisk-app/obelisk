'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import type { LoginMethodId } from '@nostr-wot/ui';
import { profileUrl } from '@/services/social/note-links';
import { publishGeneratedProfile, routeToBridge, type GeneratedProfileDraft, type LoginArgs } from '@/services/login/login-bridge';
import { isTransientNip46Error } from '@/utils/nip46/signer-link';

type SdkLogin = {
  pubkey: string;
  method: LoginMethodId;
  nsec?: string;
  bunkerUri?: string;
  clientNsec?: string;
  signer?: unknown;
};

/**
 * The login modal's flow: route an SDK login to the bridge, hold a generated
 * key back until its owner has seen and shared their npub, and quietly
 * retry the NIP-46 QR when the SDK reports the transient "closed before
 * connected" error.
 */
export function useLoginFlow({ onSuccess, onClose }: { onSuccess?: () => void; onClose?: () => void }) {
  const router = useRouter();
  const t = useTranslations();
  const [generatedLogin, setGeneratedLogin] = useState<LoginArgs | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState('');
  const [shared, setShared] = useState(false);
  // The draft is written on every keystroke of the generated-profile step but is
  // only ever *read* when the login completes, so it lives in a ref rather than
  // state. Holding it in state re-rendered LoginModal on each character, which
  // re-rendered the SDK's profile step and let its autofocused name input snatch
  // focus mid-word, the fields became untypeable after the first character.
  const generatedProfile = useRef<GeneratedProfileDraft>({});
  const [nip46Retry, setNip46Retry] = useState(0);
  const [hideTransientError, setHideTransientError] = useState(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeLogin = useCallback(() => {
    if (onClose) onClose();
    else router.push('/');
  }, [onClose, router]);
  const updateGeneratedProfile = useCallback((patch: GeneratedProfileDraft) => {
    generatedProfile.current = { ...generatedProfile.current, ...patch };
  }, []);
  useEffect(() => () => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
  }, []);

  const handleSdkError = (message: string) => {
    if (!isTransientNip46Error(message)) return;
    setHideTransientError(true);
    if (retryTimer.current) clearTimeout(retryTimer.current);
    retryTimer.current = setTimeout(() => {
      setNip46Retry((current) => current + 1);
      setHideTransientError(false);
    }, Math.min(5_000, 250 * 2 ** nip46Retry));
  };

  const onLogin = async ({ pubkey, method, nsec, bunkerUri, clientNsec, signer }: SdkLogin) => {
    const args: LoginArgs = {
      method,
      pubkey,
      ...(nsec ? { nsec } : {}),
      ...(bunkerUri ? { bunkerUri } : {}),
      ...(clientNsec ? { clientNsec } : {}),
      ...(signer ? { signer } : {}),
    };
    if (method === 'generate') {
      if (nsec) await publishGeneratedProfile(nsec, generatedProfile.current);
      setGeneratedLogin(args);
      return;
    }
    await routeToBridge(args);
    onSuccess?.();
  };

  /** Finish a generated-key signup: only now does the bridge get the signer. */
  const finish = async () => {
    if (!generatedLogin) return;
    setFinishing(true);
    setFinishError('');
    try {
      await routeToBridge(generatedLogin);
      onSuccess?.();
    } catch (error) {
      setFinishError(error instanceof Error ? error.message : String(error));
      setFinishing(false);
    }
  };

  const shareProfile = async () => {
    if (!generatedLogin) return;
    const link = profileUrl(generatedLogin.pubkey);
    try {
      if (navigator.share) {
        await navigator.share({ title: t('shell.login.shareTitle'), url: link });
      } else {
        await navigator.clipboard?.writeText(link);
        setShared(true);
      }
    } catch {
      // Share sheet dismissed, or the clipboard is unavailable: neither is
      // an error worth putting in front of someone mid-signup.
    }
  };

  return {
    generatedLogin,
    backFromGenerated: () => setGeneratedLogin(null),
    finishing,
    finishError,
    shared,
    finish,
    shareProfile,
    nip46Retry,
    hideTransientError,
    closeLogin,
    updateGeneratedProfile,
    handleSdkError,
    onLogin,
  };
}
