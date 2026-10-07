import { useState, type MouseEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useMyPubkey } from '@/services/nostr-bridge';
import { useInterests } from '@/hooks/social/tags/useInterests';
import { useToastStore } from '@/store/feedback/toast';

/**
 * The follow-a-hashtag button's view model. `visible` is false when nobody
 * is signed in: signing in is the prerequisite, and a button that only
 * reports that on click is worse than one that isn't there.
 */
export function useFollowTagButton(tag: string) {
  const t = useTranslations();
  const myPubkey = useMyPubkey();
  const { isFollowing, toggle, ready } = useInterests();
  const [busy, setBusy] = useState(false);

  const onClick = async (event: MouseEvent) => {
    // The button sits inside clickable rows and links (a trending tag, a
    // tag page header): following must not also open the tag.
    event.stopPropagation();
    event.preventDefault();
    if (busy || !ready) return;
    setBusy(true);
    try {
      await toggle(tag);
    } catch {
      useToastStore.getState().pushToast({ title: t('social.actionFailed'), body: `#${tag}` });
    } finally {
      setBusy(false);
    }
  };

  return {
    visible: !!myPubkey,
    following: isFollowing(tag),
    disabled: busy || !ready,
    onClick: (event: MouseEvent) => void onClick(event),
  };
}
