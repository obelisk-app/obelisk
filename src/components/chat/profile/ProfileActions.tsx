'use client';

import { useTranslation } from '@/i18n/context';
import Button from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';

/** Follow and message buttons under someone else's bio, plus the follow error. */
export function ProfileActions({
  pubkey,
  isMe,
  following,
  contactsReady,
  followBusy,
  followError,
  onToggleFollow,
  onMessage,
}: {
  pubkey: string;
  isMe: boolean;
  following: boolean;
  contactsReady: boolean;
  followBusy: boolean;
  followError: boolean;
  onToggleFollow: () => void;
  onMessage?: (pubkey: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      {!isMe ? (
        <div className="profile-view-actions flex shrink-0 gap-2 px-5 py-3">
          <Button
            variant="pill"
            size="xs"
            className={cn('flex-1', following && '!border !border-lc-border !bg-transparent !text-lc-white')}
            onClick={onToggleFollow}
            disabled={followBusy || !contactsReady}
            data-testid="profile-follow-button"
          >
            {!contactsReady
              ? '…'
              : followBusy
                ? t('common.saving')
                : t(following ? 'profileFeed.unfollow' : 'mobile.profile.follow')}
          </Button>
          {onMessage && (
            <Button variant="pillSecondary" size="xs" className="flex-1" onClick={() => onMessage(pubkey)}>
              {t('mobile.profile.message')}
            </Button>
          )}
        </div>
      ) : null /*
        Your own profile has no follow/message row, and the ⋯ that used to
        stand in for it moved up beside the avatar, leaving an empty strip
        of black between the bio and the composer that read as a rendering
        bug.
      */}

      {followError && <p className="px-5 pb-2 text-xs text-red-400">{t('profileFeed.followFailed')}</p>}
    </>
  );
}
