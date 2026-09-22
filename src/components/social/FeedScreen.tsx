'use client';

/**
 * The Nostr feed surface — Following and Global over the user's social relays.
 *
 * Embeddable: the desktop shell mounts it as a full view, the mobile shell as
 * a tab, and a NIP-29 relay surface can mount it as a second tab beside chat
 * (`embedded`, which drops the redundant title bar since the host already has
 * one).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Event as NostrEvent } from 'nostr-tools';
import {
  useMyContactListReady,
  useMyFollows,
  useMyPubkey,
  useUserMetadata,
} from '@/lib/nostr-bridge';
import { usePreferences } from '@/lib/preferences';
import { useTranslation } from '@/i18n/context';
import { useFeed, type FeedSource } from '@/lib/social/useFeed';
import { CONTENT_FILTERS, type ContentFilter } from '@/lib/social/kinds';
import type { FeedSort } from '@/lib/social/rank';
import ModalShell from '@/components/ModalShell';
import { useHistoryDismiss } from '@/app/app/useHistoryDismiss';
import FeedList from './FeedList';
import NoteComposer from './NoteComposer';
import MobileComposer from './MobileComposer';
import type { ComposerMode } from './useNoteDraft';
import NoteThread from './NoteThread';
import ArticleReader from './ArticleCard';
import { ComposeButton } from './FeedControls';
import FeedSearch from './FeedSearch';
import InlineReader from './InlineReader';
import StarterPacks from './StarterPacks';
import InfiniteSentinel from './InfiniteSentinel';
import MediaGrid, { type MediaItem } from '@/components/chat/MediaGrid';
import { mediaUrls } from '@/lib/profile-feed';
import { parseImeta } from '@/lib/social/imeta';
import TrendingPanel from './TrendingPanel';

export type FeedTab = 'following' | 'global';

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
  actions?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const myPubkey = useMyPubkey();
  const meta = useUserMetadata(myPubkey ?? '');
  const follows = useMyFollows();
  const contactsReady = useMyContactListReady();
  const relays = usePreferences().socialRelays;
  const [tab, setTab] = useState<FeedTab>('following');
  const [filter, setFilter] = useState<ContentFilter>('all');
  const [sort, setSort] = useState<FeedSort>('recent');
  const [searching, setSearching] = useState(false);
  const [searchSeed, setSearchSeed] = useState('');
  // A half-width pane has no more room than a phone: the source segment, two
  // chip strips and the actions wrapped onto a second line. Same answer as
  // mobile — the filters go behind one button.
  const compact = mobile || embedded;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [composer, setComposer] = useState<ComposerMode | null>(null);
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  const [openArticle, setOpenArticle] = useState<NostrEvent | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composeRowRef = useRef<HTMLDivElement>(null);
  // The inline compose row scrolls away within a screen or two, and with it
  // the only way to post. A floating button takes over from there rather
  // than making people scroll back up.
  const [composeRowVisible, setComposeRowVisible] = useState(true);

  useEffect(() => {
    const node = composeRowRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => setComposeRowVisible(entry.isIntersecting),
      { root: scrollRef.current, threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [myPubkey, composer]);

  const source = useMemo<FeedSource>(
    () => (tab === 'following' ? { kind: 'following', authors: follows } : { kind: 'global' }),
    [tab, follows],
  );
  const state = useFeed(source, relays, filter, sort);

  // A fresh key follows nobody. "Try the Global tab" pointed at a firehose
  // of strangers and left the actual job — find people worth following — to
  // the person who just arrived.
  //
  // Gated on the contact list having actually arrived: `useMyFollows()` is
  // `[]` both for someone who follows nobody and for someone whose kind 3
  // is still in flight, and treating the second as the first showed the
  // starter packs to accounts with hundreds of follows — and kept showing
  // them if the list never landed on the current relay set.
  const noFollows = tab === 'following' && contactsReady && follows.length === 0;
  const emptyLabel = noFollows ? t('social.followNobody') : undefined;

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

  // Media tiles carry the id of the note they came from, so a tap opens the
  // post rather than a bare image with no author and no way to reply.
  const mediaItems = useMemo<MediaItem[]>(() => state.notes.flatMap((note) => {
    const imeta = [...parseImeta(note).values()].map((item) => item.url);
    const urls = [...new Set([...imeta, ...mediaUrls(note)])];
    return urls.map((url) => ({
      key: `${note.id}:${url}`,
      url,
      noteId: note.id,
      multiple: urls.length > 1,
    }));
  }), [state.notes]);

  const openMediaNote = useCallback((_url: string, noteId?: string) => {
    if (noteId) openThread(noteId);
  }, [openThread]);
  const openComposer = useCallback(() => setComposer({ kind: 'note' }), []);
  const closeComposer = useCallback(() => setComposer(null), []);

  // A thread or an article takes over the surface, the way search does.
  // Handed to the host when it has a pane; otherwise inline here, never a
  // modal: an article in a centred card has less room than the feed it came
  // from, and a thread in one can't be scrolled and replied to comfortably.
  if (openArticle) {
    return (
      <InlineReader
        title={t('social.article')}
        onBack={() => setOpenArticle(null)}
        testId="feed-article-reader"
      >
        <ArticleReader note={openArticle} onOpenProfile={onOpenProfile} />
      </InlineReader>
    );
  }

  if (openNoteId) {
    return (
      <InlineReader
        title={t('social.thread')}
        onBack={() => setOpenNoteId(null)}
        testId="feed-thread-reader"
      >
        <NoteThread
          noteId={openNoteId}
          onOpenProfile={onOpenProfile}
          onOpenNote={setOpenNoteId}
        />
      </InlineReader>
    );
  }

  if (searching) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-lc-black" data-testid="feed-screen">
        <FeedSearch
          initialQuery={searchSeed}
          onOpenProfile={onOpenProfile}
          onOpenNote={openThread}
          onOpenArticle={handleOpenArticle}
          onClose={() => { setSearching(false); setSearchSeed(''); }}
        />
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-lc-black" data-testid="feed-screen">
      {/*
        One toolbar, not three stacked rows.
        Source, content filter and actions were each on their own line, so
        the chrome was taller than the first note — you scrolled before you
        read anything. They're one row now: source on the left (what you're
        reading), filters in the middle (what kind), actions pinned right.

        The middle scrolls horizontally rather than wrapping, so a narrow
        split pane shortens the row instead of growing a second line.
      */}
      {/*
        `bg-lc-dark` and `px-5`, like the chat header and the relay top bar:
        the toolbar is a header, and on the content background it read as
        the first row of the feed.
      */}
      <div className="flex min-h-14 shrink-0 flex-wrap items-center gap-2 border-b border-lc-border bg-lc-dark px-5 py-2">
        <h1 className="sr-only">{t('social.feed')}</h1>

        <div className="lc-segment shrink-0" role="tablist" aria-label={t('social.feed')}>
          {(['following', 'global'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className="lc-segment-item"
              // The count lives here rather than as its own line of text —
              // it's context for the choice, not a thing to read.
              title={value === 'following'
                ? `${follows.length} ${t('social.followingCount')}`
                : `${relays.length} ${t('social.relayCount')}`}
              data-testid={`feed-tab-${value}`}
            >
              {value === 'following' ? <FollowingIcon /> : <GlobeIcon />}
              {t(`social.${value}`)}
            </button>
          ))}
        </div>

        <div className="mx-1 hidden h-5 w-px shrink-0 bg-lc-border lg:block" aria-hidden="true" />

        {/*
          Narrows the REQ, not just the rendering — asking for 50 mixed
          events and showing the three articles among them is how an
          "Articles" view ends up looking empty.
        */}
        {/*
          Wraps to its own line when it can't fit.
          On one row this had `min-w-0 flex-1`, which let it shrink to zero
          width next to the source pill — on a phone the filters were
          present, sized to nothing, and invisible because the scrollbar is
          hidden. The min-width means the flex container wraps it to a second
          line instead of crushing it, which also covers a narrow split pane
          on a wide screen (a viewport breakpoint would not).
        */}
        {/*
          Desktop keeps the chips inline — there's room, and one tap is
          better than two. On a phone they were a hairline-scrolling strip of
          11px text; they live in the filter sheet instead, and are not
          rendered here at all so the sheet's copies are the only ones.
        */}
        {!compact && <div
          className="-mx-1 order-last flex w-full min-w-0 items-center gap-0.5 overflow-x-auto px-1 lg:order-none lg:w-auto lg:min-w-[13rem] lg:flex-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="group"
          aria-label={t('social.filter.all')}
        >
          {CONTENT_FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              aria-pressed={filter === value}
              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                filter === value
                  ? 'bg-lc-green/20 text-lc-green'
                  : 'text-lc-white/60 hover:bg-white/10 hover:text-lc-white'
              }`}
              data-testid={`feed-filter-${value}`}
            >
              {t(`social.filter.${value}`)}
            </button>
          ))}
        </div>}

        {/*
          Sort sits with the filters: both answer "what am I looking at",
          where the source pill answers "whose".
        */}
        {!compact && <div className="flex shrink-0 items-center gap-0.5" role="group">
          {(['recent', 'top'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setSort(value)}
              aria-pressed={sort === value}
              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                sort === value
                  ? 'bg-lc-green/20 text-lc-green'
                  : 'text-lc-white/60 hover:bg-white/10 hover:text-lc-white'
              }`}
              data-testid={`feed-sort-${value}`}
            >
              {t(`social.sort.${value}`)}
            </button>
          ))}
        </div>}

        {/*
          Pinned right, always, when the toolbar is compact: `lg:ml-0` was
          for the wide layout where the filter chips fill the middle, and in
          a half-width pane on a wide screen it left the actions bunched
          against the source pill with the rest of the row empty.
        */}
        <div className={`ml-auto flex shrink-0 items-center gap-1 ${compact ? '' : 'lg:ml-0'}`}>
          {/*
            One target for "what am I looking at" on a phone, sized like the
            rest of Obelisk's header buttons rather than an 11px chip.
          */}
          {compact && (
            <button
              type="button"
              className={`flex ${mobile ? 'h-10 w-10' : 'h-8 w-8'} items-center justify-center rounded-full border border-lc-border transition-colors hover:bg-white/10 active:bg-white/10 ${
                filter !== 'all' || sort !== 'recent' ? 'text-lc-green' : 'text-lc-white/70'
              }`}
              onClick={() => setFiltersOpen(true)}
              aria-label={t('social.filters')}
              title={t('social.filters')}
              data-testid="feed-filters-open"
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
                <path d="M3 5h18" /><path d="M6 12h12" /><path d="M10 19h4" />
              </svg>
            </button>
          )}
          {/*
            Refresh is gone: pulling up at the top of the feed refreshes, and
            new notes announce themselves with the green pill. A button that
            duplicates a gesture people already make is just chrome.
          */}
          <button
            type="button"
            className={mobile
              ? 'flex h-10 w-10 items-center justify-center rounded-full border border-lc-border text-lc-white/70 transition-colors active:bg-white/10'
              : compact
                ? 'flex h-8 w-8 items-center justify-center rounded-full border border-lc-border text-lc-white/70 transition-colors hover:bg-white/10'
                : 'group/act -m-1 flex items-center rounded-full p-1 text-lc-white/70'}
            onClick={() => setSearching(true)}
            aria-label={t('social.search')}
            title={t('social.search')}
            data-testid="feed-search-open"
          >
            {compact ? (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
              </svg>
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded-full transition-colors group-hover/act:bg-white/10 group-hover/act:text-lc-white">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
                </svg>
              </span>
            )}
          </button>
          {onOpenSettings && !embedded && (
            <button
              type="button"
              className="group/act -m-1 flex items-center rounded-full p-1 text-lc-white/70"
              onClick={onOpenSettings}
              aria-label={t('social.relaySettings')}
              title={t('social.relaySettings')}
              data-testid="feed-settings"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full transition-colors group-hover/act:bg-white/10 group-hover/act:text-lc-white">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </span>
            </button>
          )}
          {actions}
        </div>
      </div>

      <div
        ref={scrollRef}
        className={`min-h-0 flex-1 overflow-y-auto ${mobile ? 'native-scroll-y' : ''}`}
        data-testid="feed-scroll"
      >
        {/*
          On a wide screen the feed was one column with ~600px of black on
          either side. The column is capped at a readable measure and the
          right-hand space carries context — what the loaded notes are about,
          and whether the relays behind them are up. `xl:` only: a split pane
          is nowhere near wide enough for two columns.
        */}
        <div className="mx-auto flex w-full max-w-[1100px] items-start gap-4">
        <div className="min-w-0 flex-1 xl:max-w-[42rem]">
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
                  onPublished={() => { setComposer(null); state.refresh(); }}
                  onCancel={closeComposer}
                />
              </div>
            ) : (
              <ComposeButton
                pubkey={myPubkey}
                picture={meta?.picture}
                name={meta?.displayName || meta?.name || ''}
                onClick={openComposer}
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
            to contain pictures. Grid it, like every explore surface — the
            point of picking Media is to look, and tapping a tile opens the
            note it came from.
          */
          <>
            <MediaGrid items={mediaItems} onOpen={openMediaNote} />
            {/*
              The grid bypasses FeedList, and with it the sentinel that pages
              the feed — scrolling a wall of images just stopped at the first
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
          onOpenNote={openThread}
          onReply={startReply}
          onQuote={startQuote}
          onOpenArticle={handleOpenArticle}
          onOpenTag={openTag}
        />
        )}
        </div>

        {!mobile && !embedded && (
          <div className="sticky top-0 hidden xl:block">
            <TrendingPanel notes={state.notes} onOpenTag={openTag} />
          </div>
        )}
        </div>
      </div>

      {/*
        Bottom-right rather than bottom-left: the profile bar lives bottom-left
        on desktop, and the mobile bottom-nav sits under this, hence the
        larger offset there.
      */}
      {myPubkey && (mobile || !composeRowVisible) && !composer && (
        <button
          type="button"
          onClick={openComposer}
          aria-label={t('profileFeed.createPost')}
          title={t('profileFeed.createPost')}
          className={`absolute right-5 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-lc-green text-lc-black shadow-2xl shadow-black/50 transition hover:brightness-110 active:scale-95 ${
            mobile ? 'bottom-6' : 'bottom-5'
          }`}
          data-testid="feed-compose-fab"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14" /><path d="M5 12h14" />
          </svg>
        </button>
      )}

      {/*
        One sheet for every mode on mobile — note, reply and quote are the
        same act of writing, and a phone has room for exactly one surface.
      */}
      {mobile && composer && (
        <MobileComposer
          mode={composer}
          onPublished={() => { setComposer(null); state.refresh(); }}
          onClose={closeComposer}
        />
      )}

      {!mobile && composer && composer.kind !== 'note' && (
        <ModalShell onClose={() => setComposer(null)} testId="composer-modal">
          <div className="mb-3 text-sm font-semibold text-lc-white">
            {t(composer.kind === 'reply' ? 'social.replyAction' : 'social.quote')}
          </div>
          <NoteComposer
            autoFocus
            mode={composer}
            onPublished={() => { setComposer(null); state.refresh(); }}
            onCancel={() => setComposer(null)}
          />
        </ModalShell>
      )}


      {filtersOpen && (
        <FilterSheet
          filter={filter}
          sort={sort}
          mobile={mobile}
          onFilter={setFilter}
          onSort={setSort}
          onClose={() => setFiltersOpen(false)}
        />
      )}

    </div>
  );
}

/**
 * The phone's answer to the chip strips.
 *
 * A bottom sheet rather than a dropdown: it's within thumb reach, and the
 * options are big enough to read — which the 11px chips they replace were
 * not.
 */
function FilterSheet({
  filter,
  sort,
  mobile,
  onFilter,
  onSort,
  onClose,
}: {
  filter: ContentFilter;
  sort: FeedSort;
  /** Phone: a bottom sheet within thumb reach. Pane: a dropdown under the button. */
  mobile: boolean;
  onFilter: (value: ContentFilter) => void;
  onSort: (value: FeedSort) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  // Back closes the sheet on a phone. A desktop dropdown is dismissed by
  // clicking away, and pushing history for it would make the back button
  // feel like it did nothing.
  const dismiss = useHistoryDismiss(mobile, onClose);

  return (
    <div
      className={mobile
        ? 'fixed inset-0 z-[120] flex flex-col justify-end bg-black/60'
        : 'fixed inset-0 z-[120]'}
      role="dialog"
      aria-modal="true"
      aria-label={t('social.filters')}
      onClick={dismiss}
      data-testid="feed-filter-sheet"
    >
      <div
        className={mobile
          ? 'rounded-t-2xl border-t border-lc-border bg-lc-dark px-4 pb-8 pt-3'
          : 'absolute right-4 top-14 w-72 rounded-xl border border-lc-border bg-lc-dark p-3 shadow-2xl'}
        onClick={(event) => event.stopPropagation()}
        {...(mobile ? { style: { paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' } } : {})}
      >
        {mobile && <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-lc-border" aria-hidden="true" />}

        <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-lc-muted">
          {t('social.sort.top')} · {t('social.sort.recent')}
        </h2>
        <div className="lc-segment mb-5 w-full" role="tablist">
          {(['recent', 'top'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={sort === value}
              onClick={() => onSort(value)}
              className="lc-segment-item flex-1 justify-center py-2.5 text-sm"
              data-testid={`feed-sort-${value}`}
            >
              {t(`social.sort.${value}`)}
            </button>
          ))}
        </div>

        <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-lc-muted">
          {t('social.filters')}
        </h2>
        <div className="grid grid-cols-2 gap-2">
          {CONTENT_FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => onFilter(value)}
              className={`rounded-full border px-4 py-2.5 text-sm font-semibold transition-colors ${
                filter === value
                  ? 'border-lc-green bg-lc-green/15 text-lc-green'
                  : 'border-lc-border text-lc-muted'
              }`}
              data-testid={`feed-filter-${value}`}
            >
              {t(`social.filter.${value}`)}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={dismiss}
          className="lc-pill-secondary mt-5 w-full py-2.5 text-sm"
          data-testid="feed-filter-sheet-close"
        >
          {t('common.close')}
        </button>
      </div>
    </div>
  );
}

function FollowingIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      <path d="M2 12h20" />
    </svg>
  );
}

export type { NostrEvent };
