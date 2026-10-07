import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { copyWithToast } from '@/services/common/clipboard';
import { profileUrl } from '@/services/social/note-links';
import { shareOrCopyLink } from '@/services/social/share-link';
import { usePreferences } from '@/hooks/preferences/usePreferences';
import { useModerationStore } from '@/store/moderation';
import { useToastStore } from '@/store/feedback/toast';
import { safeNpub } from '@/utils/identity/short-npub';

/**
 * The person menu's view model: open state, the links and identifiers it
 * hands out, and the actions, each of which closes the menu. The trigger's
 * ref stays in the component: it is read by the menu for positioning.
 */
export function useProfileMenu({
  pubkey,
  displayName,
  onZap,
  onBeforeAction,
}: {
  pubkey: string;
  displayName: string;
  onZap?: () => void;
  onBeforeAction?: () => void;
}) {
  const t = useTranslations();
  const relays = usePreferences().socialRelays;
  const [open, setOpen] = useState(false);
  const muted = useModerationStore((state) => state.mutedPubkeys.includes(pubkey));
  const blocked = useModerationStore((state) => state.blockedPubkeys.includes(pubkey));
  const toggleMute = useModerationStore((state) => state.toggleMute);
  const toggleBlock = useModerationStore((state) => state.toggleBlock);

  const url = profileUrl(pubkey, relays);
  const close = () => setOpen(false);

  const share = async () => {
    if (await shareOrCopyLink({ title: displayName, url })) {
      useToastStore.getState().pushToast({ title: t('social.profileFeed.profileShared'), body: displayName });
    }
    close();
  };

  return {
    open,
    toggle: () => setOpen((value) => !value),
    close,
    url,
    npub: safeNpub(pubkey),
    muted,
    blocked,
    share: () => void share(),
    copy: (value: string, message: string) => {
      copyWithToast(value, message);
      close();
    },
    zap: () => {
      close();
      onBeforeAction?.();
      onZap?.();
    },
    mute: () => {
      toggleMute(pubkey);
      close();
    },
    block: () => {
      toggleBlock(pubkey);
      close();
    },
  };
}
