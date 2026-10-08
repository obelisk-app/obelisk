'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSignerReady, useSessionActions, useMyPubkey, useSessionGeneration } from '@/hooks/session/useSession';
import { profileForm } from '@/services/session/profile-form';
import { useForm } from '@/hooks/common/useForm';
import { filled } from '@/schemas/common/form';
import { profileFormValues } from '@/utils/chat/profile/profile-form-values';
import type { ProfileEditorInitial, ProfileUploading } from '@/types/session/profile';

/**
 * The kind 0 profile editor (`EditProfileForm` on desktop, the phone's
 * `EditProfileScreen`): the common form over `profileForm`, plus the two
 * things no other form has, which is why it stays a hook. The profile often
 * arrives after the editor opens (a cold relay), so it is adopted when it
 * lands, until the person has typed; and each picked image reports while it
 * uploads (`uploading`), which the editors show.
 */
export function useProfileEditorForm(initial: ProfileEditorInitial | null, onSaved: () => void) {
  const signerReady = useSignerReady();
  const pubkey = useMyPubkey();
  const generation = useSessionGeneration();
  const account = useMemo(() => ({ pubkey, generation }), [pubkey, generation]);
  const currentAccount = useRef<typeof account | null>(account);
  const [draftAccount, setDraftAccount] = useState(account);
  useLayoutEffect(() => {
    currentAccount.current = account;
    return () => { currentAccount.current = null; };
  }, [account]);
  const { updateProfile } = useSessionActions();
  const [uploading, setUploading] = useState<ProfileUploading>(null);
  const reportUploading = useCallback((which: ProfileUploading) => {
    if (currentAccount.current === account) setUploading(which);
  }, [account]);
  const saved = useCallback(() => {
    if (currentAccount.current === account) onSaved();
  }, [account, onSaved]);
  const form = useForm({
    ...profileForm({ initial, signerReady: signerReady && draftAccount === account }),
    submit: (values) => updateProfile(values, reportUploading),
    onSuccess: saved,
  });
  const { adopt, reset } = form;
  if (draftAccount !== account) {
    setDraftAccount(account);
    reset(profileFormValues(initial));
    setUploading(null);
  }
  useEffect(() => {
    if (initial) adopt(profileFormValues(initial));
  }, [initial, adopt]);

  return {
    ...form,
    uploading,
    /** Saving or uploading. */
    busy: form.submitting || uploading !== null,
    nameValid: filled(form.values.name),
  };
}

export type ProfileEditorForm = ReturnType<typeof useProfileEditorForm>;
