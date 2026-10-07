'use client';

/**
 * The ⋯ menu on a note.
 *
 * It used to hold two items (copy link and mute) which made it look like an
 * afterthought. A note is a signed event on a public network, and the things
 * people actually want from one are: get a link to it, see what it really
 * says on the wire, check it in another client, and get the ids needed to
 * look it up anywhere else.
 */

import { useRef } from 'react';
import type { Event as NostrEvent } from 'nostr-tools';
import { useTranslations } from 'next-intl';
import { MENU_PANEL_CLASS, MenuDivider, MenuItem } from '@/components/ui/overlays/menu';
import { useNoteMenu } from '@/hooks/social/note/useNoteMenu';
import AnchoredMenu from '../../common/AnchoredMenu';
import NoteIcon from './NoteIcon';
import NoteMenuLinkItem from './NoteMenuLinkItem';
import NoteRawEventModal from './NoteRawEventModal';

export default function NoteMenu({
  note,
  isMine,
  onDeleted,
}: {
  note: NostrEvent;
  isMine: boolean;
  onDeleted?: () => void;
}) {
  const t = useTranslations();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const vm = useNoteMenu({ note, onDeleted });

  return (
    <div className="relative ml-auto">
      <button
        ref={triggerRef}
        type="button"
        className="group/act -m-1 flex items-center rounded-full p-1 text-lc-muted transition-colors"
        onClick={vm.toggle}
        aria-label={t('social.more')}
        aria-expanded={vm.open}
        data-testid="note-more"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full transition-colors group-hover/act:bg-white/10 group-hover/act:text-lc-white">
          <NoteIcon name="more" />
        </span>
      </button>

      <AnchoredMenu
        open={vm.open}
        onClose={vm.close}
        anchorRef={triggerRef}
        width={240}
        testId="note-menu"
        panelClassName={MENU_PANEL_CLASS}
      >
        <>
          <MenuItem onClick={vm.share} testId="note-menu-share" label={t('social.shareNote')} />
          <MenuItem
            onClick={() => vm.copy(vm.shareUrl, t('social.linkCopied'))}
            testId="note-menu-copy-link"
            label={t('social.copyLink')}
          />

          <MenuDivider />

          <MenuItem onClick={vm.openRaw} testId="note-menu-raw" label={t('social.viewRaw')} />
          <MenuItem
            onClick={() => vm.copy(vm.identifier, t('social.idCopied'))}
            testId="note-menu-copy-id"
            label={t('social.copyEventId')}
          />
          <MenuItem
            onClick={() => vm.copy(vm.npub, t('social.npubCopied'))}
            testId="note-menu-copy-npub"
            label={t('social.copyAuthorNpub')}
          />
          {/*
            The npub is the identifier; this is the thing you can paste
            anywhere and have it open as a page with a name on it.
          */}
          <MenuItem
            onClick={() => vm.copy(vm.authorUrl, t('social.profileFeed.linkCopied'))}
            testId="note-menu-copy-author-link"
            label={t('social.copyAuthorLink')}
          />
          <MenuItem
            onClick={() => vm.copy(note.content, t('social.textCopied'))}
            testId="note-menu-copy-text"
            label={t('social.copyText')}
          />

          <MenuDivider />

          {vm.groupUrl && (
            <NoteMenuLinkItem href={vm.groupUrl} testId="note-menu-open-group" newTab={false}>
              {t('social.openInGroup')}
            </NoteMenuLinkItem>
          )}

          {!isMine && (
            <>
              <MenuDivider />
              <MenuItem
                onClick={vm.mute}
                testId="note-menu-mute"
                label={t(vm.muted ? 'social.profileFeed.unmute' : 'social.profileFeed.mute')}
              />
            </>
          )}

          {isMine && (
            <>
              <MenuDivider />
              <MenuItem onClick={vm.remove} danger testId="note-menu-delete" label={t('social.deleteNote')} />
            </>
          )}
        </>
      </AnchoredMenu>

      {vm.rawOpen && <NoteRawEventModal note={note} onClose={vm.closeRaw} />}
    </div>
  );
}
