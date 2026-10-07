import { useState } from 'react';
import type { Event as NostrEvent } from 'nostr-tools';
import { useTranslations } from 'next-intl';
import { useCurrentRelayUrl } from '@/services/nostr-bridge';
import { copyWithToast } from '@/services/common/clipboard';
import { groupNoteUrl, noteIdentifier, noteShareUrl, profileUrl } from '@/services/social/note-links';
import { shareOrCopyLink } from '@/services/social/share-link';
import { deleteNoteWithToast } from '@/services/social/delete-note';
import { usePreferences } from '@/hooks/preferences/usePreferences';
import { useModerationStore } from '@/store/moderation';
import { useToastStore } from '@/store/feedback/toast';
import { safeNpub } from '@/utils/identity/short-npub';

/**
 * The ⋯ menu on a note: open state, the raw-event dialog, the links and
 * identifiers it hands out, and the actions, each of which closes the menu.
 */
export function useNoteMenu({ note, onDeleted }: { note: NostrEvent; onDeleted?: () => void }) {
  const t = useTranslations();
  const relays = usePreferences().socialRelays;
  const activeRelay = useCurrentRelayUrl();
  const [open, setOpen] = useState(false);
  const [rawOpen, setRawOpen] = useState(false);
  const muted = useModerationStore((state) => state.mutedPubkeys.includes(note.pubkey));
  const toggleMute = useModerationStore((state) => state.toggleMute);

  const close = () => setOpen(false);
  const shareUrl = noteShareUrl(note, relays);

  const share = async () => {
    if (await shareOrCopyLink({ url: shareUrl })) {
      useToastStore.getState().pushToast({ title: t('social.linkCopied'), body: '' });
    }
    close();
  };

  return {
    open,
    toggle: () => setOpen((value) => !value),
    close,
    rawOpen,
    openRaw: () => {
      setRawOpen(true);
      setOpen(false);
    },
    closeRaw: () => setRawOpen(false),
    /**
     * A note that came from a NIP-29 group is only fully meaningful inside
     * it: the replies and the people are there, not on the open network.
     */
    groupUrl: groupNoteUrl(note, activeRelay),
    shareUrl,
    identifier: noteIdentifier(note, relays),
    npub: safeNpub(note.pubkey),
    authorUrl: profileUrl(note.pubkey, relays),
    muted,
    share: () => void share(),
    copy: (value: string, message: string) => {
      copyWithToast(value, message);
      close();
    },
    mute: () => {
      toggleMute(note.pubkey);
      close();
    },
    remove: () => {
      close();
      void deleteNoteWithToast(note, t, onDeleted);
    },
  };
}
