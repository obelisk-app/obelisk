'use client';

import { useCallback, useMemo, useState } from 'react';
import type { Event as NostrEvent } from 'nostr-tools';
import { useMyContactListReady, useMyFollows } from '@/services/nostr-bridge';
import { usePreferences } from '@/hooks/usePreferences';
import { useFeed, type FeedSource } from '@/hooks/social/useFeed';
import type { ContentFilter } from '@/services/social/kinds';
import type { FeedSort } from '@/services/social/rank';
import type { ComposerMode } from '@/hooks/social/useNoteDraft';
import { feedMediaItems } from '@/components/social/feed-screen/feed-media';
import type { FeedTab } from '@/components/social/feed-screen/types';

/**
 * Everything the feed surface remembers: which source, filter and sort are
 * picked, what has taken over the surface (a thread, an article, search),
 * which composer is open, and the feed itself.
 *
 * The feed (and its live tail) is `useFeed`; nothing here puts a timer on it.
 */
export function useFeedScreen({
  onOpenThread,
  onOpenArticle,
}: {
  onOpenThread?: (noteId: string) => void;
  onOpenArticle?: (note: NostrEvent) => void;
}) {
  const follows = useMyFollows();
  const contactsReady = useMyContactListReady();
  const relays = usePreferences().socialRelays;
  const [tab, setTab] = useState<FeedTab>('following');
  const [filter, setFilter] = useState<ContentFilter>('all');
  const [sort, setSort] = useState<FeedSort>('recent');
  // Only meaningful under the Articles filter, which is the one place a
  // stream of quoted paragraphs is something a reader might be after.
  const [showHighlights, setShowHighlights] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchSeed, setSearchSeed] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [composer, setComposer] = useState<ComposerMode | null>(null);
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  const [openArticle, setOpenArticle] = useState<NostrEvent | null>(null);
  // The back-to-top control can't live inside FeedList: it renders inside
  // the scroller, so a button placed there scrolls away with the notes.
  // FeedList already measures the scroll position, so it reports it here.
  const [feedAtTop, setFeedAtTop] = useState(true);

  const source = useMemo<FeedSource>(
    () => (tab === 'following' ? { kind: 'following', authors: follows } : { kind: 'global' }),
    [tab, follows],
  );
  const state = useFeed(source, relays, filter, sort, showHighlights);

  // A fresh key follows nobody. "Try the Global tab" pointed at a firehose
  // of strangers and left the actual job (find people worth following) to
  // the person who just arrived.
  //
  // Gated on the contact list having actually arrived: `useMyFollows()` is
  // `[]` both for someone who follows nobody and for someone whose kind 3
  // is still in flight, and treating the second as the first showed the
  // starter packs to accounts with hundreds of follows, and kept showing
  // them if the list never landed on the current relay set.
  const noFollows = tab === 'following' && contactsReady && follows.length === 0;

  // Stable identities: NoteCard is memoised on its handlers, so inline
  // arrows here would re-render every card in the feed on each keystroke in
  // the composer or tick of the live tail.
  const openThread = useCallback((noteId: string) => {
    if (onOpenThread) onOpenThread(noteId);
    else setOpenNoteId(noteId);
  }, [onOpenThread]);

  // `useCallback` is load-bearing here, not hygiene: NoteCard's memo
  // comparator checks these by reference, so an inline arrow re-renders every
  // card in the feed on each parent render.
  const handleOpenArticle = useCallback((note: NostrEvent) => {
    if (onOpenArticle) onOpenArticle(note);
    else setOpenArticle(note);
  }, [onOpenArticle]);

  const startReply = useCallback((note: NostrEvent) => setComposer({ kind: 'reply', parent: note }), []);
  const startQuote = useCallback((note: NostrEvent) => setComposer({ kind: 'quote', target: note }), []);
  const openTag = useCallback((tag: string) => { setSearchSeed(`#${tag}`); setSearching(true); }, []);

  const mediaItems = useMemo(() => feedMediaItems(state.notes), [state.notes]);

  const openMediaNote = useCallback((_url: string, noteId?: string) => {
    if (noteId) openThread(noteId);
  }, [openThread]);
  const openComposer = useCallback(() => setComposer({ kind: 'note' }), []);
  const closeComposer = useCallback(() => setComposer(null), []);
  const toggleHighlights = useCallback(() => setShowHighlights((value) => !value), []);
  const closeSearch = useCallback(() => { setSearching(false); setSearchSeed(''); }, []);
  // A post landed: close whichever composer sent it and pull it into view.
  const published = () => { setComposer(null); state.refresh(); };

  return {
    follows,
    relays,
    tab, setTab,
    filter, setFilter,
    sort, setSort,
    showHighlights, toggleHighlights,
    searching, setSearching, searchSeed, closeSearch,
    filtersOpen, setFiltersOpen,
    composer, setComposer, openComposer, closeComposer, published,
    openNoteId, setOpenNoteId,
    openArticle, setOpenArticle,
    feedAtTop, setFeedAtTop,
    state,
    noFollows,
    openThread,
    handleOpenArticle,
    startReply,
    startQuote,
    openTag,
    mediaItems,
    openMediaNote,
  };
}
