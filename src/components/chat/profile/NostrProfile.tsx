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

import type { Event as NostrEvent } from 'nostr-tools';
import type { JsUserMetadata } from '@/services/nostr-bridge';
import { useTranslations } from 'next-intl';
import FeedList from '@/components/social/feed/FeedList';
import { ComposeButton } from '@/components/social/feed/FeedControls';
import NoteComposer from '@/components/social/composer/NoteComposer';
import MobileComposer from '@/components/social/composer/MobileComposer';
import NoteThread from '@/components/social/note/NoteThread';
import ArticleReader from '@/components/social/article/ArticleCard';
import Modal from '@/components/ui/overlays/Modal';
import ModalHeader from '@/components/ui/overlays/ModalHeader';
import InlineReader from '@/components/social/article/InlineReader';
import ProfileLinks from './ProfileLinks';
import MediaGrid from '../gallery/MediaGrid';
import { ProfileHeader } from './ProfileHeader';
import { ProfileActions } from './ProfileActions';
import { ProfileFeedTabs } from './ProfileFeedTabs';
import { ProfileMediaLightbox } from './ProfileMediaLightbox';
import { useNostrProfile } from '@/hooks/chat/profile/useNostrProfile';

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
  const vm = useNostrProfile(pubkey, initialMeta);

  // A thread or an article takes over the profile surface rather than
  // opening in a modal on top of it: same reasoning as the feed, a card
  // with a dimmed backdrop gives an article less room than the list it came
  // from.
  if (vm.openArticle) {
    return (
      <InlineReader
        title={t('social.article')}
        onBack={vm.closeArticle}
        testId="profile-article-reader"
      >
        <ArticleReader note={vm.openArticle} onOpenProfile={onOpenProfile} />
      </InlineReader>
    );
  }

  if (vm.openNoteId) {
    return (
      <InlineReader
        title={t('social.thread')}
        onBack={vm.closeNote}
        testId="profile-thread-reader"
      >
        <NoteThread noteId={vm.openNoteId} onOpenProfile={onOpenProfile} onOpenNote={vm.setOpenNoteId} />
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
        meta={vm.meta}
        displayName={vm.displayName}
        isMe={vm.isMe}
        mobile={mobile}
        settingsMode={settingsMode}
        hideClose={hideClose}
        onClose={onClose}
        onEditProfile={onEditProfile}
        onOpenSettings={onOpenSettings}
        onCreatePost={vm.composeNote}
        onCopyNpub={vm.copyNpub}
      />

      <ProfileLinks about={vm.meta?.about} website={vm.meta?.website} lud16={vm.meta?.lud16} />

      <ProfileActions
        pubkey={pubkey}
        isMe={vm.isMe}
        following={vm.follow.following}
        contactsReady={vm.follow.contactsReady}
        followBusy={vm.follow.followBusy}
        followError={vm.follow.followError}
        onToggleFollow={() => void vm.follow.toggleFollow()}
        onMessage={onMessage}
      />

      {/*
        Desktop composes in place; a phone gets the full-screen sheet from
        the ✎ button in the header instead, because an inline row plus a
        keyboard leaves about two lines to write in.
      */}
      {vm.isMe && !mobile && (vm.composer?.kind === 'note' ? (
        <div className="mx-5 mb-4">
          <NoteComposer
            autoFocus
            onPublished={vm.notePublished}
            onCancel={vm.closeComposer}
          />
        </div>
      ) : (
        <ComposeButton
          pubkey={pubkey}
          picture={vm.meta?.picture}
          name={vm.displayName}
          onClick={vm.composeNote}
          testId="profile-create-post"
        />
      ))}

      <ProfileFeedTabs tab={vm.tab} onTab={vm.setTab} />

      <div className="profile-feed-content min-h-40 flex-1" aria-live="polite" role="tabpanel">
        {vm.tab === 'media' ? (
          vm.media.length > 0 ? (
            <MediaGrid items={vm.media} onOpen={vm.setExpandedMedia} />
          ) : (
            <div className="flex min-h-40 items-center justify-center px-6 text-center text-sm text-lc-muted" data-testid="profile-feed-empty">
              {t(vm.state.error ? 'social.profileFeed.loadFailed' : 'social.profileFeed.empty')}
            </div>
          )
        ) : (
          <FeedList
            state={{ ...vm.state, notes: vm.visibleNotes }}
            onOpenProfile={onOpenProfile}
            onOpenNote={vm.setOpenNoteId}
            onReply={vm.startReply}
            onQuote={vm.startQuote}
            onOpenArticle={vm.handleOpenArticle}
          />
        )}
      </div>

      {mobile && vm.composer && (
        <MobileComposer
          mode={vm.composer}
          onPublished={vm.notePublished}
          onClose={vm.closeComposer}
        />
      )}

      {!mobile && vm.composer && vm.composer.kind !== 'note' && (
        <Modal onClose={vm.closeComposer} testId="profile-composer-modal" panelClassName="w-full max-w-lg mx-4 flex max-h-[85vh] flex-col overflow-hidden rounded-xl border border-lc-border bg-lc-dark shadow-xl">
          <ModalHeader
            title={t(vm.composer.kind === 'reply' ? 'social.replyAction' : 'social.quote')}
            onClose={vm.closeComposer}
          />
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <NoteComposer
              autoFocus
              mode={vm.composer}
              onPublished={vm.replyPublished}
              onCancel={vm.closeComposer}
            />
          </div>
        </Modal>
      )}

      {vm.expandedMedia && (
        <ProfileMediaLightbox url={vm.expandedMedia} onClose={vm.closeMedia} />
      )}
    </div>
  );
}

export type { NostrEvent };
