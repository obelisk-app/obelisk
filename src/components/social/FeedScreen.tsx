'use client';

/**
 * The Nostr feed surface — Following and Global over the user's social relays.
 *
 * Embeddable: the desktop shell mounts it as a full view, the mobile shell as
 * a tab, and a NIP-29 relay surface can mount it as a second tab beside chat
 * (`embedded`, which drops the redundant title bar since the host already has
 * one).
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import type { Event as NostrEvent } from 'nostr-tools';
import { useMyFollows, useMyPubkey, useUserMetadata } from '@/lib/nostr-bridge';
import { usePreferences } from '@/lib/preferences';
import { useTranslation } from '@/i18n/context';
import { useFeed, type FeedSource } from '@/lib/social/useFeed';
import ModalShell from '@/components/ModalShell';
import UserAvatar from '@/components/UserAvatar';
import FeedList from './FeedList';
import NoteComposer, { type ComposerMode } from './NoteComposer';
import NoteThread from './NoteThread';
import { ComposeButton, RefreshButton } from './FeedControls';

export type FeedTab = 'following' | 'global';

export default function FeedScreen({
  onOpenProfile,
  onOpenSettings,
  onOpenThread,
  mobile = false,
  embedded = false,
}: {
  onOpenProfile?: (pubkey: string) => void;
  onOpenSettings?: () => void;
  /**
   * Hand thread opening to the host (the desktop shell opens a side pane).
   * Without it the feed falls back to its own modal.
   */
  onOpenThread?: (noteId: string) => void;
  mobile?: boolean;
  embedded?: boolean;
}) {
  const { t } = useTranslation();
  const myPubkey = useMyPubkey();
  const meta = useUserMetadata(myPubkey ?? '');
  const follows = useMyFollows();
  const relays = usePreferences().socialRelays;
  const [tab, setTab] = useState<FeedTab>('following');
  const [composer, setComposer] = useState<ComposerMode | null>(null);
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const source = useMemo<FeedSource>(
    () => (tab === 'following' ? { kind: 'following', authors: follows } : { kind: 'global' }),
    [tab, follows],
  );
  const state = useFeed(source, relays);

  const emptyLabel = tab === 'following' && follows.length === 0
    ? t('social.followNobody')
    : undefined;

  // Stable identities: NoteCard is memoised on its handlers, so inline
  // arrows here would re-render every card in the feed on each keystroke in
  // the composer or tick of the live tail.
  const openThread = useCallback((noteId: string) => {
    if (onOpenThread) onOpenThread(noteId);
    else setOpenNoteId(noteId);
  }, [onOpenThread]);

  const startReply = useCallback((note: NostrEvent) => setComposer({ kind: 'reply', parent: note }), []);
  const startQuote = useCallback((note: NostrEvent) => setComposer({ kind: 'quote', target: note }), []);
  const openComposer = useCallback(() => setComposer({ kind: 'note' }), []);
  const closeComposer = useCallback(() => setComposer(null), []);

  return (
    <div className="flex h-full min-h-0 flex-col bg-lc-black" data-testid="feed-screen">
      {!embedded && (
        <header className="flex shrink-0 items-center gap-2 px-4 py-3">
          <h1 className="text-sm font-semibold text-lc-white">{t('social.feed')}</h1>
          <div className="ml-auto flex items-center gap-1">
            <RefreshButton busy={state.loading} onClick={state.refresh} />
            {onOpenSettings && (
              <button
                type="button"
                className="group/act -m-1 flex items-center rounded-full p-1 text-lc-muted"
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
          </div>
        </header>
      )}

      <div className="flex shrink-0 items-center gap-2 border-b border-lc-border px-3 py-2">
        {/*
          A segmented pill, not underlined tabs: two underlined labels read as
          two links rather than one control, and it wasn't obvious which feed
          you were looking at.
        */}
        <div className="lc-segment" role="tablist" aria-label={t('social.feed')}>
          {(['following', 'global'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className="lc-segment-item"
              data-testid={`feed-tab-${value}`}
            >
              {value === 'following' ? <FollowingIcon /> : <GlobeIcon />}
              {t(`social.${value}`)}
            </button>
          ))}
        </div>
        <span className="hidden min-w-0 truncate text-[11px] text-lc-muted sm:block">
          {tab === 'following'
            ? `${follows.length} ${t('social.followingCount')}`
            : `${relays.length} ${t('social.relayCount')}`}
        </span>
        {embedded && (
          <div className="ml-auto flex items-center gap-1">
            <RefreshButton busy={state.loading} onClick={state.refresh} />
          </div>
        )}
      </div>

      <div
        ref={scrollRef}
        className={`min-h-0 flex-1 overflow-y-auto ${mobile ? 'native-scroll-y' : ''}`}
      >
        {myPubkey && (
          composer?.kind === 'note' ? (
            <div className="border-b border-lc-border p-4">
              <NoteComposer
                autoFocus
                onPublished={() => { setComposer(null); state.refresh(); }}
                onCancel={() => setComposer(null)}
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
          )
        )}

        <FeedList
          state={state}
          scrollRef={scrollRef}
          emptyLabel={emptyLabel}
          onOpenProfile={onOpenProfile}
          onOpenNote={openThread}
          onReply={startReply}
          onQuote={startQuote}
        />
      </div>

      {composer && composer.kind !== 'note' && (
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

      {openNoteId && (
        <ModalShell onClose={() => setOpenNoteId(null)} testId="thread-modal">
          <div className="mb-3 text-sm font-semibold text-lc-white">{t('social.thread')}</div>
          <NoteThread
            noteId={openNoteId}
            onOpenProfile={onOpenProfile}
            onOpenNote={setOpenNoteId}
          />
        </ModalShell>
      )}
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
