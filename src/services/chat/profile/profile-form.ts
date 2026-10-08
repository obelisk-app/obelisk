import { nostrActions } from '@/services/nostr-bridge';
import { BlossomUploadError, uploadToBlossom } from '@/services/media/blossom';
import type { FormSpec } from '@/types/common/form';
import { filled } from '@/schemas/common/form';
import { profileFormValues, type ProfileEditorInitial, type ProfileFormValues } from '@/utils/chat/profile/profile-form-values';

/** Which picked image is uploading now. */
export type ProfileUploading = 'picture' | 'banner' | null;

export interface ProfileFormTarget {
  initial: ProfileEditorInitial | null;
  /** Whether the signer can sign now (`useSignerReady`). */
  signerReady: boolean;
  /** Told which picked image is uploading, then `null`. */
  onUploading: (which: ProfileUploading) => void;
  onSaved: () => void;
}

/**
 * The kind 0 profile editor (the desktop panel and the phone screen). The
 * signer check comes before any upload, so an edit the person cannot sign
 * does not burn Blossom storage; picked files upload only on save; then the
 * trimmed fields are published. A failed upload says so, not "publish failed".
 */
export function profileForm(target: ProfileFormTarget): FormSpec<ProfileFormValues> {
  return {
    initial: () => profileFormValues(target.initial),
    validate: (values) => {
      if (!filled(values.name)) return 'shell.user.nameRequired';
      return target.signerReady ? null : 'shell.user.notSignedIn';
    },
    submit: async (values) => {
      try {
        let picture = values.picture.trim();
        let banner = values.banner.trim();
        if (values.pictureFile) {
          target.onUploading('picture');
          picture = await uploadToBlossom(values.pictureFile);
        }
        if (values.bannerFile) {
          target.onUploading('banner');
          banner = await uploadToBlossom(values.bannerFile);
        }
        target.onUploading(null);
        const name = values.name.trim();
        await nostrActions.editUserMetadata({
          name,
          displayName: name,
          about: values.about.trim(),
          picture,
          banner,
          nip05: values.nip05.trim(),
          lud16: values.lud16.trim(),
          website: values.website.trim(),
        });
      } finally {
        target.onUploading(null);
      }
    },
    failure: (error) => (error instanceof BlossomUploadError ? 'media.error.uploadFailed' : 'shell.user.publishFailed'),
    onSuccess: () => target.onSaved(),
  };
}
