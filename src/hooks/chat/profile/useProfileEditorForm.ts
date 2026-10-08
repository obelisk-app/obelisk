'use client';

import { useEffect, useState } from 'react';
import { useSignerReady } from '@/services/nostr-bridge';
import { profileForm, type ProfileUploading } from '@/services/chat/profile/profile-form';
import { useForm } from '@/hooks/common/useForm';
import { filled } from '@/schemas/common/form';
import { profileFormValues, type ProfileEditorInitial } from '@/utils/chat/profile/profile-form-values';

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
  const [uploading, setUploading] = useState<ProfileUploading>(null);
  const form = useForm(profileForm({ initial, signerReady, onUploading: setUploading, onSaved }));
  const { adopt } = form;

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
