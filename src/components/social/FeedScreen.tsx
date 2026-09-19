'use client';

/**
 * The global feed surface — Following and Global tabs over the user's social
 * relays.
 *
 * This is the piece the app simply didn't have: before it, the only way to
 * read anything on Nostr was to find a specific person and open their
 * profile. There was no way in at all.
 */

import { useMemo, useState } from 'react';
import type { Event as NostrEvent } from 'nostr-tools';
import { useMyFollows, useMyPubkey } from '@/lib/nostr-bridge';
import { usePreferences } from '@/lib/preferences';
import { useTranslation } from '@/i18n/context';
import { useFeed, type FeedSource } from '@/lib/social/useFeed';
import ModalShell from '@/components/ModalShell';
import FeedList from './FeedList';
import NoteComposer, { type ComposerMode } from './NoteComposer';
import NoteThread from './NoteThread';

export type FeedTab = 'following' | 'global';

export default function FeedScreen({
  onOpenProfile,
  onOpenSettings,
  mobile = false,
}: {
  onOpenProfile?: (pubkey: string) => void;
  onOpenSettings?: () => void;
  mobile?: boolean;
}) {
  const { t } = useTranslation();
  const myPubkey = useMyPubkey();
  const follows = useMyFollows();
  const relays = usePreferences().socialRelays;
  const [tab, setTab] = useState<FeedTab>('following');
  const [composer, setComposer] = useState<ComposerMode | null>(null);
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);

  const source = useMemo<FeedSource>(
    () => (tab === 'following' ? { kind: 'following', authors: follows } : { kind: 'global' }),
    [tab, follows],
  );
  const state = useFeed(source, relays);

  const emptyLabel = tab === 'following' && follows.length === 0
    ? t('social.followNobody')
    : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col bg-lc-black" data-testid="feed-screen">
      <header className="flex shrink-0 items-center gap-2 border-b border-lc-border px-4 py-3">
        <h1 className="text-sm font-semibold text-lc-white">{t('social.feed')}</h1>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-lc-muted hover:text-lc-white"
            onClick={state.refresh}
            aria-label={t('social.refresh')}
            title={t('social.refresh')}
            data-testid="feed-refresh"
          >
            ⟳
          </button>
          {onOpenSettings && (
            <button
              type="button"
              className="rounded-lg px-2 py-1 text-lc-muted hover:text-lc-white"
              onClick={onOpenSettings}
              aria-label={t('social.relaySettings')}
              title={t('social.relaySettings')}
              data-testid="feed-settings"
            >
              ⚙
            </button>
          )}
        </div>
      </header>

      <div className="grid shrink-0 grid-cols-2 border-b border-lc-border" role="tablist">
        {(['following', 'global'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={`border-b-2 px-2 py-3 text-xs font-semibold ${
              tab === value ? 'border-lc-green text-lc-green' : 'border-transparent text-lc-muted'
            }`}
            data-testid={`feed-tab-${value}`}
          >
            {t(`social.${value}`)}
          </button>
        ))}
      </div>

      <div className={`min-h-0 flex-1 overflow-y-auto ${mobile ? 'native-scroll-y' : ''}`}>
        {myPubkey && (
          <div className="border-b border-lc-border p-4">
            {composer?.kind === 'note' ? (
              <NoteComposer
                autoFocus
                onPublished={() => { setComposer(null); state.refresh(); }}
                onCancel={() => setComposer(null)}
              />
            ) : (
              <button
                type="button"
                className="lc-pill-primary flex items-center gap-2 px-4 py-2 text-xs"
                onClick={() => setComposer({ kind: 'note' })}
                data-testid="feed-compose"
              >
                <span className="text-lg leading-none" aria-hidden="true">+</span>
                {t('profileFeed.createPost')}
              </button>
            )}
          </div>
        )}

        <FeedList
          state={state}
          emptyLabel={emptyLabel}
          onOpenProfile={onOpenProfile}
          onOpenNote={setOpenNoteId}
          onReply={(note) => setComposer({ kind: 'reply', parent: note })}
          onQuote={(note) => setComposer({ kind: 'quote', target: note })}
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

export type { NostrEvent };
