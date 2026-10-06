'use client';

/**
 * The Nostr feed surface: Following and Global over the user's social relays.
 *
 * Embeddable: the desktop shell mounts it as a full view, the mobile shell as
 * a tab, and a NIP-29 relay surface can mount it as a second tab beside chat
 * (`embedded`, which drops the redundant title bar since the host already has
 * one).
 */

import { useRef, type ReactNode } from 'react';
import type { Event as NostrEvent } from 'nostr-tools';
import { useMyPubkey } from '@/services/nostr-bridge';
import { useTranslation } from '@/i18n/context';
import Modal from '@/components/ui/Modal';
import NoteComposer from './NoteComposer';
import MobileComposer from './MobileComposer';
import NoteThread from './NoteThread';
import ArticleReader from './ArticleCard';
import FeedSearch from './FeedSearch';
import InlineReader from './InlineReader';
import FeedWidgets from './FeedWidgets';
import FeedToolbar from './feed-screen/FeedToolbar';
import FeedColumn from './feed-screen/FeedColumn';
import FeedFloatingControls from './feed-screen/FeedFloatingControls';
import FilterSheet from './feed-screen/FilterSheet';
import { useFeedScreen } from '@/hooks/social/feed-screen/useFeedScreen';
import { useComposeRowVisible } from '@/hooks/social/feed-screen/useComposeRowVisible';


export default function FeedScreen({
  onOpenProfile,
  onOpenSettings,
  onOpenThread,
  onOpenArticle,
  mobile = false,
  embedded = false,
  actions,
}: {
  onOpenProfile?: (pubkey: string) => void;
  onOpenSettings?: () => void;
  /**
   * Hand thread opening to the host (the desktop shell opens a side pane).
   * Without it the feed falls back to its own modal.
   */
  onOpenThread?: (noteId: string) => void;
  /**
   * Same handoff as `onOpenThread`, for long-form. The desktop shell reuses
   * its side pane; without it the feed falls back to its own modal.
   */
  onOpenArticle?: (note: NostrEvent) => void;
  mobile?: boolean;
  embedded?: boolean;
  /**
   * Host controls (expand / restore / close) appended to the toolbar's right
   * cluster. The desktop pane used to carry its own title bar for these; one
   * toolbar that already says what you're looking at is enough.
   */
  actions?: ReactNode;
}) {
  const { t } = useTranslation();
  const myPubkey = useMyPubkey();
  const feed = useFeedScreen({ onOpenThread, onOpenArticle });
  const { state, composer } = feed;
  // A half-width pane has no more room than a phone: the source segment, two
  // chip strips and the actions wrapped onto a second line. Same answer as
  // mobile: the filters go behind one button.
  const compact = mobile || embedded;
  const scrollRef = useRef<HTMLDivElement>(null);
  const composeRowRef = useRef<HTMLDivElement>(null);
  const composeRowVisible = useComposeRowVisible(composeRowRef, scrollRef, myPubkey, composer);
  const emptyLabel = feed.noFollows ? t('social.followNobody') : undefined;

  // A thread or an article takes over the surface, the way search does.
  // Handed to the host when it has a pane; otherwise inline here, never a
  // modal: an article in a centred card has less room than the feed it came
  // from, and a thread in one can't be scrolled and replied to comfortably.
  if (feed.openArticle) {
    return (
      <InlineReader
        title={t('social.article')}
        onBack={() => feed.setOpenArticle(null)}
        testId="feed-article-reader"
      >
        <ArticleReader note={feed.openArticle} onOpenProfile={onOpenProfile} />
      </InlineReader>
    );
  }

  if (feed.openNoteId) {
    return (
      <InlineReader
        title={t('social.thread')}
        onBack={() => feed.setOpenNoteId(null)}
        testId="feed-thread-reader"
      >
        <NoteThread
          noteId={feed.openNoteId}
          onOpenProfile={onOpenProfile}
          onOpenNote={feed.setOpenNoteId}
        />
      </InlineReader>
    );
  }

  if (feed.searching) {
    return (
      <div className="flex h-full min-h-0 flex-col" data-testid="feed-screen">
        <FeedSearch
          initialQuery={feed.searchSeed}
          onOpenProfile={onOpenProfile}
          onOpenNote={feed.openThread}
          onOpenArticle={feed.handleOpenArticle}
          onClose={feed.closeSearch}
        />
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col" data-testid="feed-screen">
      <FeedToolbar
        tab={feed.tab}
        onTab={feed.setTab}
        followCount={feed.follows.length}
        relayCount={feed.relays.length}
        compact={compact}
        embedded={embedded}
        filter={feed.filter}
        onFilter={feed.setFilter}
        sort={feed.sort}
        onSort={feed.setSort}
        showHighlights={feed.showHighlights}
        onToggleHighlights={feed.toggleHighlights}
        onOpenFilters={() => feed.setFiltersOpen(true)}
        onOpenSearch={() => feed.setSearching(true)}
        onOpenSettings={onOpenSettings}
        actions={actions}
      />

      <div
        ref={scrollRef}
        className={`min-h-0 flex-1 overflow-y-auto ${mobile ? 'native-scroll-y' : ''}`}
        data-testid="feed-scroll"
      >
        {/*
          On a wide screen the feed was one column with ~600px of black on
          either side. The column is capped at a readable measure and the
          right-hand space carries context: what the loaded notes are about,
          and whether the relays behind them are up. `xl:` only: a split pane
          is nowhere near wide enough for two columns.
        */}
        <div className="mx-auto flex w-full max-w-[1100px] items-start gap-4">
        {/*
          The trailing padding clears the floating controls. They are
          `absolute` over this scroller, so without it the last notes (and
          any link card at the end) sat underneath the ↑ and + buttons with
          no way to scroll them out. Sized for the taller stack: the compose
          FAB at `bottom-6` plus the back-to-top pill at `bottom-24`.
        */}
        <div className="min-w-0 flex-1 pb-28 md:pb-24 xl:max-w-[42rem]">
          <FeedColumn
            myPubkey={myPubkey}
            mobile={mobile}
            composer={composer}
            composeRowRef={composeRowRef}
            scrollRef={scrollRef}
            state={state}
            filter={feed.filter}
            noFollows={feed.noFollows}
            emptyLabel={emptyLabel}
            mediaItems={feed.mediaItems}
            onOpenMediaNote={feed.openMediaNote}
            onOpenComposer={feed.openComposer}
            onCloseComposer={feed.closeComposer}
            onPublished={feed.published}
            onOpenProfile={onOpenProfile}
            onOpenNote={feed.openThread}
            onReply={feed.startReply}
            onQuote={feed.startQuote}
            onOpenArticle={feed.handleOpenArticle}
            onOpenTag={feed.openTag}
            onAtTopChange={feed.setFeedAtTop}
          />
        </div>

        {!mobile && !embedded && (
          /*
            Bounded and scrollable, not just sticky: with three or four
            widgets the column grew past the viewport and everything below
            the fold (including the picker that put them there) was
            unreachable, because `sticky` pins the top and lets the rest
            hang off the bottom.

            The offset is the feed header above this scroll container, which
            is what `top-0` is measured from.
          */
          <div className="sticky top-0 hidden max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain xl:block [scrollbar-width:thin]">
            <FeedWidgets
              notes={state.notes}
              onOpenTag={feed.openTag}
              onOpenProfile={onOpenProfile}
            />
          </div>
        )}
        </div>
      </div>

      <FeedFloatingControls
        showBackToTop={!feed.feedAtTop && !composer && feed.filter !== 'media'}
        showCompose={!!myPubkey && (mobile || !composeRowVisible) && !composer}
        pendingCount={state.pendingCount}
        mobile={mobile}
        scrollRef={scrollRef}
        onShowPending={state.showPending}
        onCompose={feed.openComposer}
      />

      {/*
        One sheet for every mode on mobile: note, reply and quote are the
        same act of writing, and a phone has room for exactly one surface.
      */}
      {mobile && composer && (
        <MobileComposer
          mode={composer}
          onPublished={feed.published}
          onClose={feed.closeComposer}
        />
      )}

      {!mobile && composer && composer.kind !== 'note' && (
        <Modal onClose={() => feed.setComposer(null)} testId="composer-modal">
          <div className="mb-3 text-sm font-semibold text-lc-white">
            {t(composer.kind === 'reply' ? 'social.replyAction' : 'social.quote')}
          </div>
          <NoteComposer
            autoFocus
            mode={composer}
            onPublished={feed.published}
            onCancel={() => feed.setComposer(null)}
          />
        </Modal>
      )}

      {feed.filtersOpen && (
        <FilterSheet
          filter={feed.filter}
          sort={feed.sort}
          mobile={mobile}
          onFilter={feed.setFilter}
          onSort={feed.setSort}
          showHighlights={feed.showHighlights}
          onToggleHighlights={feed.toggleHighlights}
          onClose={() => feed.setFiltersOpen(false)}
        />
      )}
    </div>
  );
}

export type { NostrEvent };
