'use client';

import { useCallback, useState } from 'react';
import type { Event as NostrEvent } from 'nostr-tools';
import { useTranslations } from 'next-intl';
import type { JsUserMetadata } from '@/services/nostr-bridge';
import { usePreferences } from '@/hooks/preferences/usePreferences';
import type { ComposerMode } from '@/hooks/social/composer/useNoteDraft';
import { copyWithToast } from '@/services/common/clipboard';
import { displayNameFor } from '@/utils/identity/display-name';
import { safeNpub } from '@/utils/identity/short-npub';
import { useProfileMeta } from './useProfileMeta';
import { useProfileFollow } from './useProfileFollow';
import { useProfileFeed } from './useProfileFeed';

/**
 * A profile with its feed: the kind 0, following, the feed tabs on the
 * social relays, and what is open over it (a composer, a thread, an
 * article, a media item).
 */
export function useNostrProfile(pubkey: string, initialMeta: Partial<JsUserMetadata> | null) {
  const t = useTranslations();
  const meta = useProfileMeta(pubkey, initialMeta);
  const relays = usePreferences().socialRelays;
  const follow = useProfileFollow(pubkey, relays);
  const { tab, setTab, state, visibleNotes, media } = useProfileFeed(pubkey, relays);

  const [composer, setComposer] = useState<ComposerMode | null>(null);
  const [expandedMedia, setExpandedMedia] = useState<string | null>(null);
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  const [openArticle, setOpenArticle] = useState<NostrEvent | null>(null);
  const displayName = displayNameFor(pubkey, meta);

  // Stable identity: NoteCard's memo compares handlers by reference.
  const handleOpenArticle = useCallback((note: NostrEvent) => setOpenArticle(note), []);
  const startReply = useCallback((note: NostrEvent) => setComposer({ kind: 'reply', parent: note }), []);
  const startQuote = useCallback((note: NostrEvent) => setComposer({ kind: 'quote', target: note }), []);

  return {
    meta,
    follow,
    isMe: follow.isMe,
    displayName,
    tab,
    setTab,
    state,
    visibleNotes,
    media,
    composer,
    expandedMedia,
    openNoteId,
    openArticle,
    setExpandedMedia,
    setOpenNoteId,
    closeMedia: () => setExpandedMedia(null),
    closeNote: () => setOpenNoteId(null),
    closeArticle: () => setOpenArticle(null),
    handleOpenArticle,
    startReply,
    startQuote,
    composeNote: () => setComposer({ kind: 'note' }),
    closeComposer: () => setComposer(null),
    /** A new post: close the composer, show Posts, and reload so it appears. */
    notePublished: () => {
      setComposer(null);
      setTab('posts');
      state.refresh();
    },
    /** A reply or quote: close the composer and reload, staying on the tab. */
    replyPublished: () => {
      setComposer(null);
      state.refresh();
    },
    copyNpub: () => copyWithToast(safeNpub(pubkey), t('social.profileFeed.npubCopied'), displayName),
  };
}
