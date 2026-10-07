'use client';

import { useTranslations } from 'next-intl';
import { type ScreenName } from '@/utils/shell/mobile/url-state';
import { useEditProfileScreen } from '@/hooks/shell/mobile/screens/profile/useEditProfileScreen';
import BackButton from '../../chrome/BackButton';
import EditProfileBannerTap from './EditProfileBannerTap';
import EditProfileAvatarTap from './EditProfileAvatarTap';
import EditProfileFields from './EditProfileFields';

/**
 * The phone's profile editor: tap the banner or avatar to pick an image, or
 * paste its URL; the kind 0 fields; save in the header and at the foot.
 * State and handlers come from `useEditProfileScreen`.
 */
export function EditProfileScreen({ go }: { go: (s: ScreenName, dir?: 'forward' | 'back') => void }) {
  const t = useTranslations();
  const vm = useEditProfileScreen(go);
  return (
    <div className="screen active" data-screen="profile-edit">
      <div className="setup-header">
        <BackButton onClick={vm.goBack} disabled={vm.busy} />
        <h2>{t('mobile.settings.editProfile')}</h2>
        <button
          className="setup-skip save-action"
          onClick={vm.save}
          disabled={vm.saveDisabled}
          data-testid="save-profile"
        >
          {vm.busyLabel ?? t('common.save')}
        </button>
      </div>
      <div className="setup-body edit-profile-body">
        {vm.error && <div className="edit-error" role="alert">{vm.error}</div>}

        <EditProfileBannerTap image={vm.currentBanner} uploading={vm.uploadingBanner} onFile={vm.onBannerFile} />

        <EditProfileAvatarTap
          pubkey={vm.myPubkey}
          name={vm.name}
          image={vm.currentPicture}
          uploading={vm.uploadingAvatar}
          onFile={vm.onPictureFile}
        />

        <EditProfileFields vm={vm} />
      </div>
      <div className="setup-actions">
        <button
          className="btn-primary"
          onClick={vm.save}
          disabled={vm.saveDisabled}
        >
          {vm.busyLabel ?? t('mobile.settings.saveChanges')}
        </button>
      </div>
    </div>
  );
}
