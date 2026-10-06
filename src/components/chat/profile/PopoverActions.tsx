'use client';

import { useTranslation } from '@/i18n/context';
import { CompassIcon, EditIcon, MessageIcon, SettingsIcon } from '@/components/ui/icons';
import { openSettings } from '@/utils/open-settings';
import Button from '@/components/ui/Button';


/** Edit / preferences on your own card, message on anyone else's, explore on both. */
export function PopoverActions({
  pubkey,
  isSelf,
  onClose,
  onExplore,
  onMessage,
}: {
  pubkey: string;
  isSelf: boolean;
  onClose: () => void;
  onExplore: (pubkey: string) => void;
  onMessage?: (pubkey: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2 border-t border-lc-border pt-3" data-testid="profile-compact-actions">
      {isSelf ? (
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outlinePill"
            size="xs"
            className="h-8"
            onClick={() => { onClose(); openSettings('profile'); }}
            data-testid="profile-edit-btn"
          >
            <EditIcon size={15} /> {t('settings.editProfile')}
          </Button>
          <Button
            variant="outlinePill"
            size="xs"
            className="h-8"
            onClick={() => { onClose(); openSettings('general'); }}
            data-testid="profile-preferences-btn"
          >
            <SettingsIcon size={15} /> {t('settings.openPreferences')}
          </Button>
        </div>
      ) : onMessage && (
        <Button
          variant="outlinePill"
          size="xs"
          className="h-8 w-full"
          onClick={() => {
            onClose();
            onMessage(pubkey);
          }}
          data-testid="profile-message-btn"
        >
          <MessageIcon size={15} /> {t('mobile.profile.message')}
        </Button>
      )}
      <Button
        variant="pill"
        size="xs"
        onClick={() => {
          onClose();
          onExplore(pubkey);
        }}
        className="w-full"
        data-testid="profile-explore-btn"
      >
        <CompassIcon size={15} /> {t('profileFeed.explore')}
      </Button>
    </div>
  );
}
