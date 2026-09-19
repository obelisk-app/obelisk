'use client';

/**
 * The ⋯ menu on a note.
 *
 * It used to hold two items — copy link and mute — which made it look like an
 * afterthought. A note is a signed event on a public network, and the things
 * people actually want from one are: get a link to it, see what it really
 * says on the wire, check it in another client, and get the ids needed to
 * look it up anywhere else.
 */

import { useEffect, useRef, useState } from 'react';
import type { Event as NostrEvent } from 'nostr-tools';
import { hexToNpub } from '@nostr-wot/data';
import { usePreferences } from '@/lib/preferences';
import { useTranslation } from '@/i18n/context';
import { useModerationStore } from '@/store/moderation';
import { useToastStore } from '@/store/toast';
import ModalShell from '@/components/ModalShell';
import {
  groupNoteUrl,
  noteIdentifier,
  noteShareUrl,
  rawEventJson,
} from '@/lib/social/note-links';
import { useCurrentRelayUrl } from '@/lib/nostr-bridge';
import { MoreIcon } from './NoteActions';
import { publishDelete } from '@/lib/social/publish';

export default function NoteMenu({
  note,
  isMine,
  onDeleted,
}: {
  note: NostrEvent;
  isMine: boolean;
  onDeleted?: () => void;
}) {
  const { t } = useTranslation();
  const relays = usePreferences().socialRelays;
  const activeRelay = useCurrentRelayUrl();
  // A note that came from a NIP-29 group is only fully meaningful inside it —
  // the replies and the people are there, not on the open network.
  const groupUrl = groupNoteUrl(note, activeRelay);
  const identifier = noteIdentifier(note, relays);
  const [open, setOpen] = useState(false);
  const [rawOpen, setRawOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const muted = useModerationStore((state) => state.mutedPubkeys.includes(note.pubkey));
  const toggleMute = useModerationStore((state) => state.toggleMute);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toast = (title: string) => useToastStore.getState().pushToast({ title, body: '' });

  const copy = (value: string, message: string) => {
    navigator.clipboard?.writeText(value).catch(() => {});
    toast(message);
    setOpen(false);
  };

  const share = async () => {
    const url = noteShareUrl(note, relays);
    try {
      if (navigator.share) await navigator.share({ url });
      else await navigator.clipboard?.writeText(url);
      toast(t('social.linkCopied'));
    } catch {
      // Share sheet dismissed — not an error worth surfacing.
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
    <div className="relative ml-auto" ref={wrapRef}>
      <button
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

      {open && (
        <div
          className="absolute bottom-full right-0 z-30 mb-1 w-60 overflow-hidden rounded-xl border border-lc-border bg-lc-dark py-1 shadow-2xl"
          role="menu"
          data-testid="note-menu"
        >
          <Item onClick={() => void share()} testId="note-menu-share">
            {t('social.shareNote')}
          </Item>
          <Item
            onClick={() => copy(noteShareUrl(note, relays), t('social.linkCopied'))}
            testId="note-menu-copy-link"
          >
            {t('social.copyLink')}
          </Item>

          <Divider />

          <Item
            onClick={() => { setRawOpen(true); setOpen(false); }}
            testId="note-menu-raw"
          >
            {t('social.viewRaw')}
          </Item>
          <Item
            onClick={() => copy(identifier, t('social.idCopied'))}
            testId="note-menu-copy-id"
          >
            {t('social.copyEventId')}
          </Item>
          <Item
            onClick={() => copy(safeNpub(note.pubkey), t('social.npubCopied'))}
            testId="note-menu-copy-npub"
          >
            {t('social.copyAuthorNpub')}
          </Item>
          <Item
            onClick={() => copy(note.content, t('social.textCopied'))}
            testId="note-menu-copy-text"
          >
            {t('social.copyText')}
          </Item>

          <Divider />

          {groupUrl && (
            <LinkItem href={groupUrl} testId="note-menu-open-group" newTab={false}>
              {t('social.openInGroup')}
            </LinkItem>
          )}


          {!isMine && (
            <>
              <Divider />
              <Item
                onClick={() => { toggleMute(note.pubkey); setOpen(false); }}
                testId="note-menu-mute"
              >
                {t(muted ? 'profileFeed.unmute' : 'profileFeed.mute')}
              </Item>
            </>
          )}

          {isMine && (
            <>
              <Divider />
              <Item onClick={() => void remove()} danger testId="note-menu-delete">
                {t('social.deleteNote')}
              </Item>
            </>
          )}
        </div>
      )}

      {rawOpen && (
        <ModalShell
          onClose={() => setRawOpen(false)}
          testId="note-raw-modal"
          panelClassName="w-full max-w-2xl mx-4 rounded-xl bg-lc-dark border border-lc-border p-5 shadow-xl"
        >
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-sm font-semibold text-lc-white">{t('social.rawEvent')}</h2>
            <button
              type="button"
              className="lc-pill-secondary ml-auto px-3 py-1.5 text-xs"
              onClick={() => copyRaw(note, t('social.rawCopied'))}
              data-testid="note-raw-copy"
            >
              {t('social.copyJson')}
            </button>
          </div>
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
        </ModalShell>
      )}
    </div>
  );
}

function copyRaw(note: NostrEvent, message: string) {
  navigator.clipboard?.writeText(rawEventJson(note)).catch(() => {});
  useToastStore.getState().pushToast({ title: message, body: '' });
}

function Item({
  children,
  onClick,
  danger,
  testId,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  testId: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`block w-full px-4 py-2 text-left text-xs hover:bg-white/5 ${danger ? 'text-red-400' : 'text-lc-white'}`}
      onClick={onClick}
      data-testid={testId}
    >
      {children}
    </button>
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
      className="block w-full px-4 py-2 text-left text-xs text-lc-white hover:bg-white/5"
      data-testid={testId}
    >
      {children}
    </a>
  );
}

function Divider() {
  return <div className="my-1 h-px bg-lc-border" aria-hidden="true" />;
}

function safeNpub(pubkey: string): string {
  try {
    return hexToNpub(pubkey);
  } catch {
    return pubkey;
  }
}
