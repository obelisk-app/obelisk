import { BlossomUploadError } from '@/services/media/blossom';
import type { FormSpec } from '@/types/common/form';
import { filled } from '@/schemas/common/form';
import { profileFormValues } from '@/utils/chat/profile/profile-form-values';
import type { ProfileEditorInitial, ProfileFormValues } from '@/types/session/profile';

export interface ProfileFormTarget {
  initial: ProfileEditorInitial | null;
  /** Whether the signer can sign now (`useSignerReady`). */
  signerReady: boolean;
}

/** Shared initial fields, validation and error copy for both profile editors. */
export function profileForm(target: ProfileFormTarget): Pick<FormSpec<ProfileFormValues>, 'initial' | 'validate' | 'failure'> {
  return {
    initial: () => profileFormValues(target.initial),
    validate: (values) => {
      if (!filled(values.name)) return 'shell.user.nameRequired';
      return target.signerReady ? null : 'shell.user.notSignedIn';
    },
    failure: (error) => (error instanceof BlossomUploadError ? 'media.error.uploadFailed' : 'shell.user.publishFailed'),
  };
}
