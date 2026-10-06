'use client';

/**
 * A profile with its feed.
 *
 * This used to own everything: its own `SimplePool`, its own subscription,
 * its own note renderer and composer, and a `key={pubkey:relays}` remount
 * that threw all of it away on any navigation. Now it composes the shared
 * social core: one pool, cached notes, real pagination: and the same
 * `NoteCard` the global feed uses, so a note renders identically wherever it
 * appears.
 */

import { displayNameFor } from '@/utils/identity/display-name';
import { useCallback, useState } from 'react';
import type { Event as NostrEvent } from 'nostr-tools';
import { hexToNpub } from '@nostr-wot/data';
import type { JsUserMetadata } from '@/services/nostr-bridge';
import { usePreferences } from '@/hooks/usePreferences';
import { useTranslations } from 'next-intl';
import FeedList from '@/components/social/FeedList';
import { ComposeButton } from '@/components/social/FeedControls';
import NoteComposer from '@/components/social/NoteComposer';
import MobileComposer from '@/components/social/MobileComposer';
import type { ComposerMode } from '@/hooks/social/useNoteDraft';
import NoteThread from '@/components/social/NoteThread';
import ArticleReader from '@/components/social/ArticleCard';
import Modal from '@/components/ui/Modal';
import InlineReader from '@/components/social/InlineReader';
import ProfileLinks from './ProfileLinks';
import MediaGrid from './MediaGrid';
import { ProfileHeader } from './profile/ProfileHeader';
import { ProfileActions } from './profile/ProfileActions';
import { ProfileFeedTabs } from './profile/ProfileFeedTabs';
import { ProfileMediaLightbox } from './profile/ProfileMediaLightbox';
import { copyWithToast } from '@/services/clipboard';
import { useProfileMeta } from '@/hooks/chat/profile/useProfileMeta';
import { useProfileFollow } from '@/hooks/chat/profile/useProfileFollow';
import { useProfileFeed } from '@/hooks/chat/profile/useProfileFeed';

type NostrProfileProps = {
  pubkey: string;
  onClose: () => void;
  onMessage?: (pubkey: string) => void;
  settingsMode?: boolean;
  onEditProfile?: () => void;
  onOpenProfile?: (pubkey: string) => void;
  /** Opens app preferences: the gear below the banner in mobile settings. */
  onOpenSettings?: () => void;
  /** Phone presentation: full-screen composer instead of the inline card. */
  mobile?: boolean;
  /**
   * Server-fetched kind 0, for the public `/p` page.
   *
   * That page is server-rendered so a shared npub previews with a name and
   * a bio; the bridge has nothing until it connects in the browser, so
   * without this the first paint would be a nameless placeholder: worse
   * than what the static page showed before.
   */
  initialMeta?: Partial<JsUserMetadata> | null;
  /**
   * The host draws the close control. Desktop panes have a header with
   * back/expand now, and a second floating ✕ on top of the banner was one
   * too many ways out of the same pane.
   */
  hideClose?: boolean;
};

export default function NostrProfile({
  pubkey,
  onClose,
  onMessage,
  settingsMode = false,
  onEditProfile,
  onOpenProfile,
  onOpenSettings,
  mobile = false,
  initialMeta = null,
  hideClose = false,
}: NostrProfileProps) {
  const t = useTranslations();
  const meta = useProfileMeta(pubkey, initialMeta);
  const relays = usePreferences().socialRelays;
  const follow = useProfileFollow(pubkey, relays);
  const { tab, setTab, state, visibleNotes, media } = useProfileFeed(pubkey, relays);

  const [composer, setComposer] = useState<ComposerMode | null>(null);
  const [expandedMedia, setExpandedMedia] = useState<string | null>(null);
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  const [openArticle, setOpenArticle] = useState<NostrEvent | null>(null);

  const { isMe } = follow;
  const displayName = displayNameFor(pubkey, meta);

  // Stable handler identities keep the memoised NoteCards from re-rendering.
  // Stable identity: NoteCard's memo compares handlers by reference.
  const handleOpenArticle = useCallback((note: NostrEvent) => setOpenArticle(note), []);
  const startReply = useCallback((note: NostrEvent) => setComposer({ kind: 'reply', parent: note }), []);
  const startQuote = useCallback((note: NostrEvent) => setComposer({ kind: 'quote', target: note }), []);

  const copyNpub = () => copyWithToast(hexToNpub(pubkey), t('social.profileFeed.npubCopied'), displayName);

  // A thread or an article takes over the profile surface rather than
  // opening in a modal on top of it: same reasoning as the feed, a card
  // with a dimmed backdrop gives an article less room than the list it came
  // from.
  if (openArticle) {
    return (
      <InlineReader
        title={t('social.article')}
        onBack={() => setOpenArticle(null)}
        testId="profile-article-reader"
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
        testId="profile-thread-reader"
      >
        <NoteThread noteId={openNoteId} onOpenProfile={onOpenProfile} onOpenNote={setOpenNoteId} />
      </InlineReader>
    );
  }

  return (
    <div
      className={(settingsMode ? '' : 'screen active') + ' profile-view-screen flex h-full min-h-0 flex-col overflow-y-auto bg-lc-black'}
      data-testid="nostr-profile"
    >
      <ProfileHeader
        pubkey={pubkey}
        meta={meta}
        displayName={displayName}
        isMe={isMe}
        mobile={mobile}
        settingsMode={settingsMode}
        hideClose={hideClose}
        onClose={onClose}
        onEditProfile={onEditProfile}
        onOpenSettings={onOpenSettings}
        onCreatePost={() => setComposer({ kind: 'note' })}
        onCopyNpub={copyNpub}
      />

      <ProfileLinks about={meta?.about} website={meta?.website} lud16={meta?.lud16} />

      <ProfileActions
        pubkey={pubkey}
        isMe={isMe}
        following={follow.following}
        contactsReady={follow.contactsReady}
        followBusy={follow.followBusy}
        followError={follow.followError}
        onToggleFollow={() => void follow.toggleFollow()}
        onMessage={onMessage}
      />

      {/*
        Desktop composes in place; a phone gets the full-screen sheet from
        the ✎ button in the header instead, because an inline row plus a
        keyboard leaves about two lines to write in.
      */}
      {isMe && !mobile && (composer?.kind === 'note' ? (
        <div className="mx-5 mb-4">
          <NoteComposer
            autoFocus
            onPublished={() => { setComposer(null); setTab('posts'); state.refresh(); }}
            onCancel={() => setComposer(null)}
          />
        </div>
      ) : (
        <ComposeButton
          pubkey={pubkey}
          picture={meta?.picture}
          name={displayName}
          onClick={() => setComposer({ kind: 'note' })}
          testId="profile-create-post"
        />
      ))}

      <ProfileFeedTabs tab={tab} onTab={setTab} />

      <div className="profile-feed-content min-h-40 flex-1" aria-live="polite" role="tabpanel">
        {tab === 'media' ? (
          media.length > 0 ? (
            <MediaGrid items={media} onOpen={setExpandedMedia} />
          ) : (
            <div className="flex min-h-40 items-center justify-center px-6 text-center text-sm text-lc-muted" data-testid="profile-feed-empty">
              {t(state.error ? 'social.profileFeed.loadFailed' : 'social.profileFeed.empty')}
            </div>
          )
        ) : (
          <FeedList
            state={{ ...state, notes: visibleNotes }}
            onOpenProfile={onOpenProfile}
            onOpenNote={setOpenNoteId}
            onReply={startReply}
            onQuote={startQuote}
            onOpenArticle={handleOpenArticle}
          />
        )}
      </div>

      {mobile && composer && (
        <MobileComposer
          mode={composer}
          onPublished={() => { setComposer(null); setTab('posts'); state.refresh(); }}
          onClose={() => setComposer(null)}
        />
      )}

      {!mobile && composer && composer.kind !== 'note' && (
        <Modal onClose={() => setComposer(null)} testId="profile-composer-modal">
          <NoteComposer
            autoFocus
            mode={composer}
            onPublished={() => { setComposer(null); state.refresh(); }}
            onCancel={() => setComposer(null)}
          />
        </Modal>
      )}

      {expandedMedia && (
        <ProfileMediaLightbox url={expandedMedia} onClose={() => setExpandedMedia(null)} />
      )}
    </div>
  );
}

export type { NostrEvent };
