'use client';

import { useTranslations } from 'next-intl';
import { CompassIcon, EditIcon, ChatIcon, GearIcon } from '@/assets/icons';
import { usePopoverActions } from '@/hooks/chat/profile/usePopoverActions';
import Button from '@/components/ui/buttons/Button';


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
  const t = useTranslations();
  const vm = usePopoverActions(pubkey, onClose, onExplore, onMessage);
  return (
    <div className="space-y-2 border-t border-lc-border pt-3" data-testid="profile-compact-actions">
      {isSelf ? (
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outlinePill"
            size="xs"
            className="h-8"
            onClick={vm.editProfile}
            data-testid="profile-edit-btn"
          >
            <EditIcon size={15} /> {t('settings.editProfile')}
          </Button>
          <Button
            variant="outlinePill"
            size="xs"
            className="h-8"
            onClick={vm.openPreferences}
            data-testid="profile-preferences-btn"
          >
            <GearIcon size={15} /> {t('settings.openPreferences')}
          </Button>
        </div>
      ) : onMessage && (
        <Button
          variant="outlinePill"
          size="xs"
          className="h-8 w-full"
          onClick={vm.message}
          data-testid="profile-message-btn"
        >
          <ChatIcon size={15} /> {t('mobile.profile.message')}
        </Button>
      )}
      <Button
        variant="pill"
        size="xs"
        onClick={vm.explore}
        className="w-full"
        data-testid="profile-explore-btn"
      >
        <CompassIcon size={15} /> {t('social.profileFeed.explore')}
      </Button>
    </div>
  );
}
