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

import { useRef, useState } from 'react';
import type { Event as NostrEvent } from 'nostr-tools';
import { copyWithToast } from '@/services/clipboard';
import { safeNpub } from '@/utils/identity/short-npub';
import { usePreferences } from '@/hooks/usePreferences';
import { useTranslations } from 'next-intl';
import { useModerationStore } from '@/store/moderation';
import { useToastStore } from '@/store/toast';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import ModalHeader from '@/components/ui/ModalHeader';
import { MENU_PANEL_CLASS, MenuDivider, MenuItem } from '@/components/ui/menu';
import AnchoredMenu from './AnchoredMenu';
import {
  groupNoteUrl,
  noteIdentifier,
  noteShareUrl,
  profileUrl,
  rawEventJson,
} from '@/services/social/note-links';
import { useCurrentRelayUrl } from '@/services/nostr-bridge';
import { MoreIcon } from './NoteActions';
import { publishDelete } from '@/services/social/publish';

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
  const relays = usePreferences().socialRelays;
  const activeRelay = useCurrentRelayUrl();
  // A note that came from a NIP-29 group is only fully meaningful inside it:
  // the replies and the people are there, not on the open network.
  const groupUrl = groupNoteUrl(note, activeRelay);
  const identifier = noteIdentifier(note, relays);
  const [open, setOpen] = useState(false);
  const [rawOpen, setRawOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const muted = useModerationStore((state) => state.mutedPubkeys.includes(note.pubkey));
  const toggleMute = useModerationStore((state) => state.toggleMute);

  const toast = (title: string) => useToastStore.getState().pushToast({ title, body: '' });

  const copy = (value: string, message: string) => {
    copyWithToast(value, message);
    setOpen(false);
  };

  const share = async () => {
    const url = noteShareUrl(note, relays);
    try {
      if (navigator.share) await navigator.share({ url });
      else await navigator.clipboard?.writeText(url);
      toast(t('social.linkCopied'));
    } catch {
      // Share sheet dismissed: not an error worth surfacing.
    }
    setOpen(false);
  };

  const remove = async () => {
    setOpen(false);
    try {
      await publishDelete(note);
      toast(t('social.deleteRequested'));
      onDeleted?.();
    } catch {
      toast(t('social.actionFailed'));
    }
  };

  return (
    <div className="relative ml-auto">
      <button
        ref={triggerRef}
        type="button"
        className="group/act -m-1 flex items-center rounded-full p-1 text-lc-muted transition-colors"
        onClick={() => setOpen((value) => !value)}
        aria-label={t('social.more')}
        aria-expanded={open}
        data-testid="note-more"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full transition-colors group-hover/act:bg-white/10 group-hover/act:text-lc-white">
          <MoreIcon />
        </span>
      </button>

      <AnchoredMenu
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        width={240}
        testId="note-menu"
        panelClassName={MENU_PANEL_CLASS}
      >
        <>
          <MenuItem onClick={() => void share()} testId="note-menu-share" label={t('social.shareNote')} />
          <MenuItem
            onClick={() => copy(noteShareUrl(note, relays), t('social.linkCopied'))}
            testId="note-menu-copy-link"
            label={t('social.copyLink')}
          />

          <MenuDivider />

          <MenuItem
            onClick={() => { setRawOpen(true); setOpen(false); }}
            testId="note-menu-raw"
            label={t('social.viewRaw')}
          />
          <MenuItem
            onClick={() => copy(identifier, t('social.idCopied'))}
            testId="note-menu-copy-id"
            label={t('social.copyEventId')}
          />
          <MenuItem
            onClick={() => copy(safeNpub(note.pubkey), t('social.npubCopied'))}
            testId="note-menu-copy-npub"
            label={t('social.copyAuthorNpub')}
          />
          {/*
            The npub is the identifier; this is the thing you can paste
            anywhere and have it open as a page with a name on it.
          */}
          <MenuItem
            onClick={() => copy(profileUrl(note.pubkey, relays), t('social.profileFeed.linkCopied'))}
            testId="note-menu-copy-author-link"
            label={t('social.copyAuthorLink')}
          />
          <MenuItem
            onClick={() => copy(note.content, t('social.textCopied'))}
            testId="note-menu-copy-text"
            label={t('social.copyText')}
          />

          <MenuDivider />

          {groupUrl && (
            <LinkItem href={groupUrl} testId="note-menu-open-group" newTab={false}>
              {t('social.openInGroup')}
            </LinkItem>
          )}


          {!isMine && (
            <>
              <MenuDivider />
              <MenuItem
                onClick={() => { toggleMute(note.pubkey); setOpen(false); }}
                testId="note-menu-mute"
                label={t(muted ? 'social.profileFeed.unmute' : 'social.profileFeed.mute')}
              />
            </>
          )}

          {isMine && (
            <>
              <MenuDivider />
              <MenuItem onClick={() => void remove()} danger testId="note-menu-delete" label={t('social.deleteNote')} />
            </>
          )}
        </>
      </AnchoredMenu>

      {rawOpen && (
        <Modal
          onClose={() => setRawOpen(false)}
          testId="note-raw-modal"
          panelClassName="w-full max-w-2xl mx-4 flex flex-col overflow-hidden rounded-xl bg-lc-dark border border-lc-border shadow-xl"
        >
          <ModalHeader title={t('social.rawEvent')} onClose={() => setRawOpen(false)}>
            <Button
              variant="pillSecondary"
              size="xs"
              onClick={() => copyWithToast(rawEventJson(note), t('social.rawCopied'))}
              data-testid="note-raw-copy"
            >
              {t('social.copyJson')}
            </Button>
          </ModalHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {/*
              `break-all` because an event is full of 64-character hex strings
              that would otherwise force the dialog wider than the viewport.
            */}
            <dl className="mb-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
              <dt className="text-lc-muted">{t('social.eventIdLabel')}</dt>
              <dd className="truncate font-mono text-lc-white" data-testid="note-raw-id">{note.id}</dd>
              <dt className="text-lc-muted">{t('social.kindLabel')}</dt>
              <dd className="font-mono text-lc-white">{note.kind}</dd>
            </dl>
            <pre
              className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-all rounded-lg border border-lc-border bg-lc-black p-3 font-mono text-[11px] leading-relaxed text-lc-muted"
              data-testid="note-raw-json"
            >
              {rawEventJson(note)}
            </pre>
          </div>
        </Modal>
      )}
    </div>
  );
}

function LinkItem({
  children,
  href,
  testId,
  newTab = true,
}: {
  children: React.ReactNode;
  href: string;
  testId: string;
  newTab?: boolean;
}) {
  return (
    <a
      role="menuitem"
      href={href}
      {...(newTab ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
      // The row look of `menu.tsx`'s `MenuItem`; `MenuLink` always opens a new
      // tab, and the group link must not.
      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-lc-white transition-colors hover:bg-lc-green/15"
      data-testid={testId}
    >
      {children}
    </a>
  );
}
