'use client';

import type { RefObject } from 'react';
import type { Event as NostrEvent } from 'nostr-tools';
import { useUserMetadata } from '@/services/nostr-bridge';
import { useTranslations } from 'next-intl';
import type { FeedState } from '@/hooks/social/useFeed';
import type { ContentFilter } from '@/services/social/kinds';
import MediaGrid from '@/components/chat/MediaGrid';
import type { MediaItem } from '@/services/social/feed-media';
import FeedList from '../FeedList';
import NoteComposer from '../NoteComposer';
import type { ComposerMode } from '@/hooks/social/useNoteDraft';
import { ComposeButton } from '../FeedControls';
import StarterPacks from '../StarterPacks';
import InfiniteSentinel from '../InfiniteSentinel';

/** The reading column: the inline compose row, then starter packs, the media grid, or the note list. */
export default function FeedColumn({
  myPubkey,
  mobile,
  composer,
  composeRowRef,
  scrollRef,
  state,
  filter,
  noFollows,
  emptyLabel,
  mediaItems,
  onOpenMediaNote,
  onOpenComposer,
  onCloseComposer,
  onPublished,
  onOpenProfile,
  onOpenNote,
  onReply,
  onQuote,
  onOpenArticle,
  onOpenTag,
  onAtTopChange,
}: {
  myPubkey: string | null | undefined;
  mobile: boolean;
  composer: ComposerMode | null;
  composeRowRef: RefObject<HTMLDivElement | null>;
  scrollRef: RefObject<HTMLDivElement | null>;
  state: FeedState;
  filter: ContentFilter;
  noFollows: boolean;
  emptyLabel?: string;
  mediaItems: MediaItem[];
  onOpenMediaNote: (url: string, noteId?: string) => void;
  onOpenComposer: () => void;
  onCloseComposer: () => void;
  onPublished: () => void;
  onOpenProfile?: (pubkey: string) => void;
  onOpenNote: (noteId: string) => void;
  onReply: (note: NostrEvent) => void;
  onQuote: (note: NostrEvent) => void;
  onOpenArticle: (note: NostrEvent) => void;
  onOpenTag: (tag: string) => void;
  onAtTopChange: (atTop: boolean) => void;
}) {
  const t = useTranslations();
  const meta = useUserMetadata(myPubkey ?? '');
  return (
    <>
      {/*
        Desktop only. On a phone the row was a link to an input dressed as
        an input; the FAB below opens the full-screen composer instead,
        which is what every phone client does and what a thumb can hit.
      */}
      {myPubkey && !mobile && (
        <div ref={composeRowRef}>
          {composer?.kind === 'note' ? (
            <div className="border-b border-lc-border p-4">
              <NoteComposer
                autoFocus
                onPublished={onPublished}
                onCancel={onCloseComposer}
              />
            </div>
          ) : (
            <ComposeButton
              pubkey={myPubkey}
              picture={meta?.picture}
              name={meta?.displayName || meta?.name || ''}
              onClick={onOpenComposer}
              testId="feed-compose"
            />
          )}
        </div>
      )}

      {noFollows ? (
        <StarterPacks onOpenProfile={onOpenProfile} />
      ) : filter === 'media' ? (
        /*
          A media filter that renders note rows is a text feed that happens
          to contain pictures. Grid it, like every explore surface: the
          point of picking Media is to look, and tapping a tile opens the
          note it came from.
        */
        <>
          <MediaGrid items={mediaItems} onOpen={onOpenMediaNote} />
          {/*
            The grid bypasses FeedList, and with it the sentinel that pages
            the feed: scrolling a wall of images just stopped at the first
            page.
          */}
          <InfiniteSentinel
            onReach={state.loadMore}
            disabled={state.exhausted || state.loadingMore}
          />
          {state.loadingMore && (
            <p className="py-6 text-center text-xs text-lc-muted">{t('social.loadingMore')}</p>
          )}
        </>
      ) : (
        <FeedList
          state={state}
          scrollRef={scrollRef}
          emptyLabel={emptyLabel}
          onOpenProfile={onOpenProfile}
          onOpenNote={onOpenNote}
          onReply={onReply}
          onQuote={onQuote}
          onOpenArticle={onOpenArticle}
          onOpenTag={onOpenTag}
          onAtTopChange={onAtTopChange}
        />
      )}
    </>
  );
}
