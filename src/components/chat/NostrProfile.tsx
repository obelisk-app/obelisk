'use client';

/**
 * A profile with its feed.
 *
 * This used to own everything: its own `SimplePool`, its own subscription,
 * its own note renderer and composer, and a `key={pubkey:relays}` remount
 * that threw all of it away on any navigation. Now it composes the shared
 * social core — one pool, cached notes, real pagination — and the same
 * `NoteCard` the global feed uses, so a note renders identically wherever it
 * appears.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Event as NostrEvent } from 'nostr-tools';
import { hexToNpub } from '@nostr-wot/data';
import {
  getBridge,
  nostrActions,
  useMyContactList,
  useMyContactListReady,
  useMyPubkey,
  useUserMetadata,
} from '@/lib/nostr-bridge';
import { usePreferences } from '@/lib/preferences';
import { mediaUrls, toggledFollowTags, type ProfileFeedTab } from '@/lib/profile-feed';
import { isReplyNote } from '@/lib/social/feed';
import { useFeed } from '@/lib/social/useFeed';
import { isVideoUrl } from '@/lib/attachments';
import { useTranslation } from '@/i18n/context';
import UserAvatar from '@/components/UserAvatar';
import FeedList from '@/components/social/FeedList';
import { ComposeButton } from '@/components/social/FeedControls';
import NoteComposer from '@/components/social/NoteComposer';
import MobileComposer from '@/components/social/MobileComposer';
import type { ComposerMode } from '@/components/social/useNoteDraft';
import ProfileLinks from './ProfileLinks';
import MediaGrid, { type MediaItem } from './MediaGrid';
import NoteThread from '@/components/social/NoteThread';
import ArticleReader from '@/components/social/ArticleCard';
import ModalShell from '@/components/ModalShell';
import { useModerationStore } from '@/store/moderation';
import { useToastStore } from '@/store/toast';

type NostrProfileProps = {
  pubkey: string;
  onClose: () => void;
  onMessage?: (pubkey: string) => void;
  settingsMode?: boolean;
  onEditProfile?: () => void;
  onOpenProfile?: (pubkey: string) => void;
  /** Opens app preferences — the gear below the banner in mobile settings. */
  onOpenSettings?: () => void;
  /** Phone presentation: full-screen composer instead of the inline card. */
  mobile?: boolean;
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
}: NostrProfileProps) {
  const { t } = useTranslation();
  const meta = useUserMetadata(pubkey);
  const myPubkey = useMyPubkey();
  const relays = usePreferences().socialRelays;
  const contactEvent = useMyContactList();
  const contactsReady = useMyContactListReady() || !myPubkey;

  const [tab, setTab] = useState<ProfileFeedTab>('posts');
  const [followBusy, setFollowBusy] = useState(false);
  const [followError, setFollowError] = useState(false);
  const [composer, setComposer] = useState<ComposerMode | null>(null);
  const [expandedMedia, setExpandedMedia] = useState<string | null>(null);
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  const [openArticle, setOpenArticle] = useState<NostrEvent | null>(null);

  // No `key=` remount any more: the feed hook keys its own cache, so
  // switching profiles or relay sets reuses whatever is already cached
  // instead of blanking the list.
  const source = useMemo(() => ({ kind: 'profile' as const, pubkey }), [pubkey]);
  const state = useFeed(source, relays);

  useEffect(() => {
    void nostrActions.ensureUserMetadata(pubkey).catch(() => {});
  }, [pubkey]);

  const isMe = myPubkey === pubkey;
  const following = !!contactEvent?.tags.some((tag) => tag[0] === 'p' && tag[1] === pubkey);
  const displayName = meta?.displayName || meta?.name || shortNpub(pubkey);

  const visibleNotes = useMemo(() => state.notes.filter((note) => (
    tab === 'posts'
      ? !isReplyNote(note)
      : tab === 'replies'
        ? isReplyNote(note)
        : mediaUrls(note).length > 0
  )), [state.notes, tab]);

  const media = useMemo<MediaItem[]>(() => visibleNotes.flatMap((note) => {
    const urls = mediaUrls(note);
    // `multiple` marks a note that carried a set, the way a carousel is
    // badged in an explore grid — otherwise four tiles from one post look
    // like four unrelated ones.
    return urls.map((url) => ({ key: `${note.id}:${url}`, url, multiple: urls.length > 1 }));
  }), [visibleNotes]);


  // Stable handler identities keep the memoised NoteCards from re-rendering.
  // Stable identity: NoteCard's memo compares handlers by reference.
  const handleOpenArticle = useCallback((note: NostrEvent) => setOpenArticle(note), []);
  const startReply = useCallback((note: NostrEvent) => setComposer({ kind: 'reply', parent: note }), []);
  const startQuote = useCallback((note: NostrEvent) => setComposer({ kind: 'quote', target: note }), []);

  const copyNpub = () => {
    navigator.clipboard?.writeText(hexToNpub(pubkey)).catch(() => {});
    useToastStore.getState().pushToast({ title: t('profileFeed.npubCopied'), body: displayName });
  };

  const toggleFollow = async () => {
    if (!myPubkey || !contactsReady || followBusy) return;
    setFollowBusy(true);
    setFollowError(false);
    try {
      const bridge = await getBridge();
      await bridge.publishEvent({
        kind: 3,
        content: contactEvent?.content ?? '',
        tags: toggledFollowTags(contactEvent?.tags ?? [], pubkey, !following),
        created_at: Math.max(Math.floor(Date.now() / 1000), (contactEvent?.created_at ?? 0) + 1),
      }, { extraRelays: relays, mode: 'replace' });
    } catch {
      setFollowError(true);
    } finally {
      setFollowBusy(false);
    }
  };

  return (
    <div
      className={(settingsMode ? '' : 'screen active') + ' profile-view-screen flex h-full min-h-0 flex-col overflow-y-auto bg-lc-black'}
      data-testid="nostr-profile"
    >
      {!settingsMode && (
        <div className="sticky top-3 z-10 hidden h-0 shrink-0 md:block" data-testid="profile-explore-close-sticky">
          <button
            type="button"
            onClick={onClose}
            className="ml-auto mr-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-xl leading-none text-lc-white"
            aria-label={t('common.close')}
            data-testid="profile-explore-close"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
      )}

      <div
        className="profile-view-banner relative h-36 shrink-0 bg-gradient-to-br from-lc-olive to-lc-black bg-cover bg-center"
        style={meta?.banner ? { backgroundImage: `url(${meta.banner})` } : undefined}
        data-testid="nostr-profile-banner"
      >
        <div className={'profile-view-topbar absolute inset-x-3 top-3 z-10 flex ' + (settingsMode ? 'justify-end' : 'justify-between')}>
          {!settingsMode && (
            <button
              type="button"
              onClick={onClose}
              className="back-btn flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-lc-white md:hidden"
              aria-label={t('common.back')}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
          )}
          {settingsMode && onEditProfile && (
            <button
              type="button"
              className="lc-pill-secondary ml-auto bg-black/70 px-4 py-2 text-xs text-lc-white backdrop-blur"
              onClick={onEditProfile}
              data-testid="edit-profile-btn"
            >
              {t('mobile.settings.editProfile')}
            </button>
          )}
        </div>
      </div>

      {/*
        The strip beside the avatar used to be empty black. It's where a
        phone expects the profile's own controls: settings on your own
        profile, and the button that opens the composer.
      */}
      <div className="relative z-10 -mt-14 flex shrink-0 items-end justify-between gap-3 px-5">
        <UserAvatar
          pubkey={pubkey}
          picture={meta?.picture}
          size={28}
          name={displayName}
          alt={displayName}
          className="profile-view-avatar border-4 border-lc-black"
          initialClassName="text-3xl"
        />
        <div className="mb-2 flex items-center gap-2">
          {isMe && mobile && (
            <button
              type="button"
              onClick={() => setComposer({ kind: 'note' })}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-lc-green text-lc-black active:scale-95"
              aria-label={t('profileFeed.createPost')}
              data-testid="profile-create-post"
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </button>
          )}
          {onOpenSettings && (
            <button
              type="button"
              onClick={onOpenSettings}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-lc-border bg-lc-dark text-lc-white active:scale-95"
              aria-label={t('settings.preferences')}
              title={t('settings.preferences')}
              data-testid="profile-settings-gear"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="profile-view-meta shrink-0 px-5 pb-1 pt-3">
        <div className="profile-view-name text-xl font-extrabold text-lc-white">{displayName}</div>
        {meta?.nip05 && <div className="profile-view-nip05 mt-1 text-xs text-lc-green">{meta.nip05}</div>}
        <div className="mt-1 flex min-w-0 items-center gap-2" data-testid="profile-npub-row">
          <div className="profile-view-npub min-w-0 truncate font-mono text-[10px] text-lc-muted">{shortNpub(pubkey)}</div>
          {settingsMode && (
            <button
              type="button"
              className="shrink-0 rounded-lg border border-lc-border px-2 py-1 text-[10px] text-lc-muted"
              onClick={copyNpub}
              data-testid="copy-npub"
            >
              {t('profileFeed.copyNpub')}
            </button>
          )}
        </div>
      </div>

      <ProfileLinks about={meta?.about} website={meta?.website} lud16={meta?.lud16} />

      {!isMe ? (
        <div className="profile-view-actions flex shrink-0 gap-2 px-5 py-3">
          <button
            type="button"
            className={`lc-pill-primary flex-1 text-xs disabled:opacity-50 ${following ? '!border !border-lc-border !bg-transparent !text-lc-white' : ''}`}
            onClick={() => void toggleFollow()}
            disabled={followBusy || !contactsReady}
            data-testid="profile-follow-button"
          >
            {!contactsReady
              ? '…'
              : followBusy
                ? t('common.saving')
                : t(following ? 'profileFeed.unfollow' : 'mobile.profile.follow')}
          </button>
          {onMessage && (
            <button type="button" className="lc-pill-secondary flex-1 text-xs" onClick={() => onMessage(pubkey)}>
              {t('mobile.profile.message')}
            </button>
          )}
          <ProfileMoreMenu pubkey={pubkey} displayName={displayName} canModerate />
        </div>
      ) : !settingsMode ? (
        <div className="flex items-center gap-2 px-5 py-3">
          <ProfileMoreMenu pubkey={pubkey} displayName={displayName} />
        </div>
      ) : null /*
        On your own profile in settings this row held nothing: an empty
        strip of black between the bio and the composer that read as a
        rendering bug. The ⋯ menu it would have carried is redundant there —
        copy-npub is already next to the npub.
      */}

      {followError && <p className="px-5 pb-2 text-xs text-red-400">{t('profileFeed.followFailed')}</p>}

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

      {/*
        Pills, not underlined tabs: every other switch in Obelisk
        (Siguiendo/Global, the filters, the settings tabs) is a segmented
        pill, and three full-width underlines stretched across a phone read
        as a different app's chrome.
      */}
      <div className="profile-feed-tabs sticky top-0 z-[2] flex justify-center border-y border-lc-border bg-lc-black/95 px-4 py-2 backdrop-blur" role="tablist">
        <div className="lc-segment w-full max-w-sm">
          {(['posts', 'replies', 'media'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className="lc-segment-item flex-1 justify-center"
              data-testid={`profile-tab-${value}`}
              role="tab"
              aria-selected={tab === value}
            >
              {t(`profileFeed.${value}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="profile-feed-content min-h-40 flex-1" aria-live="polite" role="tabpanel">
        {tab === 'media' ? (
          media.length > 0 ? (
            <MediaGrid items={media} onOpen={setExpandedMedia} />
          ) : (
            <div className="flex min-h-40 items-center justify-center px-6 text-center text-sm text-lc-muted" data-testid="profile-feed-empty">
              {t(state.error ? 'profileFeed.loadFailed' : 'profileFeed.empty')}
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
        <ModalShell onClose={() => setComposer(null)} testId="profile-composer-modal">
          <NoteComposer
            autoFocus
            mode={composer}
            onPublished={() => { setComposer(null); state.refresh(); }}
            onCancel={() => setComposer(null)}
          />
        </ModalShell>
      )}

      {openArticle && (
        <ModalShell
          onClose={() => setOpenArticle(null)}
          testId="profile-article-modal"
          panelClassName="w-full max-w-2xl mx-4 rounded-xl bg-lc-dark border border-lc-border shadow-xl max-h-[85vh] overflow-y-auto"
        >
          <ArticleReader note={openArticle} onOpenProfile={onOpenProfile} />
        </ModalShell>
      )}

      {openNoteId && (
        <ModalShell onClose={() => setOpenNoteId(null)} testId="profile-thread-modal">
          <NoteThread noteId={openNoteId} onOpenProfile={onOpenProfile} onOpenNote={setOpenNoteId} />
        </ModalShell>
      )}

      {expandedMedia && (
        <ProfileMediaLightbox url={expandedMedia} onClose={() => setExpandedMedia(null)} />
      )}
    </div>
  );
}

function ProfileMediaLightbox({ url, onClose }: { url: string; onClose: () => void }) {
  const { t } = useTranslation();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/90 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('profileFeed.media')}
      onClick={onClose}
      data-testid="profile-media-lightbox"
    >
      <button
        type="button"
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/70 text-2xl text-white"
        onClick={onClose}
        aria-label={t('common.close')}
      >
        ×
      </button>
      {isVideoUrl(url) ? (
        <video src={url} controls autoPlay className="max-h-full max-w-full object-contain" onClick={(event) => event.stopPropagation()} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="max-h-full max-w-full object-contain" onClick={(event) => event.stopPropagation()} />
      )}
    </div>
  );
}

function ProfileMoreMenu({
  pubkey,
  displayName,
  canModerate = false,
}: {
  pubkey: string;
  displayName: string;
  canModerate?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const muted = useModerationStore((state) => state.mutedPubkeys.includes(pubkey));
  const blocked = useModerationStore((state) => state.blockedPubkeys.includes(pubkey));
  const toggleMute = useModerationStore((state) => state.toggleMute);
  const toggleBlock = useModerationStore((state) => state.toggleBlock);
  const npub = hexToNpub(pubkey);
  const notify = (title: string) => useToastStore.getState().pushToast({ title, body: displayName });

  const copyNpub = () => {
    navigator.clipboard?.writeText(npub).catch(() => {});
    notify(t('profileFeed.npubCopied'));
    setOpen(false);
  };

  const shareProfile = async () => {
    try {
      if (navigator.share) await navigator.share({ title: displayName, text: npub });
      else await navigator.clipboard?.writeText(npub);
      notify(t('profileFeed.profileShared'));
    } catch {
      // Native share cancellation needs no error UI.
    }
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        className="lc-pill-secondary h-full px-4 text-base leading-none"
        onClick={() => setOpen((value) => !value)}
        aria-label={t('mobile.profile.more')}
        aria-expanded={open}
        data-testid="profile-more-button"
      >
        ⋯
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-44 overflow-hidden rounded-xl border border-lc-border bg-lc-dark py-1 shadow-2xl" data-testid="profile-more-menu">
          <button type="button" className="block w-full px-4 py-2 text-left text-xs text-lc-white hover:bg-white/5" onClick={copyNpub}>
            {t('profileFeed.copyNpub')}
          </button>
          {canModerate && (
            <>
              <button
                type="button"
                className="block w-full px-4 py-2 text-left text-xs text-lc-white hover:bg-white/5"
                onClick={() => { toggleMute(pubkey); setOpen(false); }}
              >
                {t(muted ? 'profileFeed.unmute' : 'profileFeed.mute')}
              </button>
              <button
                type="button"
                className="block w-full px-4 py-2 text-left text-xs text-red-400 hover:bg-white/5"
                onClick={() => { toggleBlock(pubkey); setOpen(false); }}
              >
                {t(blocked ? 'profileFeed.unblock' : 'profileFeed.block')}
              </button>
            </>
          )}
          <button type="button" className="block w-full px-4 py-2 text-left text-xs text-lc-white hover:bg-white/5" onClick={() => void shareProfile()}>
            {t('profileFeed.shareProfile')}
          </button>
        </div>
      )}
    </div>
  );
}

function shortNpub(pubkey: string): string {
  try {
    const npub = hexToNpub(pubkey);
    return `${npub.slice(0, 12)}…${npub.slice(-6)}`;
  } catch {
    return `${pubkey.slice(0, 10)}…${pubkey.slice(-6)}`;
  }
}

export type { NostrEvent };
